import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { sendReplyNotificationEmail, sendAdminNewFeedbackEmail } from '@/lib/email'
import { generateShareUrl } from '@/lib/url'
import { rateLimit } from '@/lib/rate-limit'
import { validateRequest, createCommentSchema } from '@/lib/validation'
import { cookies } from 'next/headers'
import { isSmtpConfigured } from '@/lib/settings'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

/**
 * Sanitize comment data before sending to client
 * SECURITY-FIRST: Zero PII exposure policy
 * - Clients NEVER see real names or emails (even on public shares)
 * - Only admins in admin panel get full data for management
 * - All email/notification handling is server-side only
 */
function sanitizeComment(comment: any, isAdmin: boolean) {
  const sanitized: any = {
    id: comment.id,
    projectId: comment.projectId,
    videoId: comment.videoId,
    videoVersion: comment.videoVersion,
    timestamp: comment.timestamp,
    content: comment.content,
    isInternal: comment.isInternal,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    parentId: comment.parentId,
  }

  // NEVER expose real names or emails to non-admins
  // Use generic labels only
  if (isAdmin) {
    // Admins get real data for management purposes only
    sanitized.authorName = comment.authorName
    sanitized.authorEmail = comment.authorEmail
    sanitized.notifyByEmail = comment.notifyByEmail
    sanitized.notificationEmail = comment.notificationEmail
    sanitized.userId = comment.userId
    if (comment.user) {
      sanitized.user = {
        id: comment.user.id,
        name: comment.user.name,
        email: comment.user.email
      }
    }
  } else {
    // Clients/public users ONLY see generic labels - zero PII
    sanitized.authorName = comment.isInternal ? 'Admin' : 'Client'
    // NO email fields at all for non-admins
  }

  // Recursively sanitize replies
  if (comment.replies && Array.isArray(comment.replies)) {
    sanitized.replies = comment.replies.map((reply: any) => sanitizeComment(reply, isAdmin))
  }

  return sanitized
}

export async function POST(request: NextRequest) {
  // Rate limiting to prevent comment spam
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many comments. Please slow down.'
  }, 'comments-create')
  
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const body = await request.json()
    
    // Note: Don't log body - may contain PII (emails)
    
    // Validate and sanitize input
    const validation = validateRequest(createCommentSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error, details: validation.details },
        { status: 400 }
      )
    }
    
    const {
      projectId,
      videoId,
      videoVersion,
      timestamp,
      content,
      authorName,
      authorEmail,
      parentId,
      isInternal,
      notifyByEmail,
      notificationEmail
    } = validation.data

    // Get current user if authenticated (for admin comments)
    const currentUser = await getCurrentUserFromRequest(request)

    // SECURITY: If isInternal flag is set, verify admin session
    if (isInternal) {
      if (!currentUser || currentUser.role !== 'ADMIN') {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
    }

    // Fetch the project to check password protection
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        sharePassword: true,
      }
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // If password protected and user is not admin, verify share authentication
    if (project.sharePassword && !currentUser) {
      const cookieStore = await cookies()
      const authSessionId = cookieStore.get('share_auth')?.value

      if (!authSessionId) {
        // Don't reveal if project exists - return generic error
        return NextResponse.json(
          { error: 'Unable to process request' },
          { status: 400 }
        )
      }

      // Verify auth session maps to this project
      const redis = await import('@/lib/video-access').then(m => m.getRedis())
      const mappedProjectId = await redis.get(`auth_project:${authSessionId}`)

      if (mappedProjectId !== project.id) {
        // Don't reveal if project exists - return generic error
        return NextResponse.json(
          { error: 'Unable to process request' },
          { status: 400 }
        )
      }
    }

    // Get video version if videoId is provided but version isn't
    let finalVideoVersion = videoVersion
    if (videoId && !videoVersion) {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        select: { version: true }
      })
      if (video) {
        finalVideoVersion = video.version
      }
    }

    const comment = await prisma.comment.create({
      data: {
        projectId,
        videoId: videoId || null,
        videoVersion: finalVideoVersion || null,
        timestamp: timestamp !== null && timestamp !== undefined ? timestamp : null,
        content,
        authorName: authorName || null,
        authorEmail: authorEmail || null,
        isInternal: isInternal || false,
        parentId: parentId || null,
        notifyByEmail: notifyByEmail || false,
        notificationEmail: notificationEmail || null,
        userId: currentUser?.id || null, // Store user ID if authenticated
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          }
        },
        replies: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                email: true,
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    // Send email notification if this is a reply to a comment
    if (parentId && isInternal) {
      // Check if SMTP is configured before attempting to send email
      const smtpConfigured = await isSmtpConfigured()
      if (smtpConfigured) {
        try {
          // Get the parent comment to check if notifications are enabled
          const parentComment = await prisma.comment.findUnique({
          where: { id: parentId },
          select: {
            notifyByEmail: true,
            notificationEmail: true,
            authorEmail: true,
            authorName: true,
            content: true,
          }
        })

        // Get project details
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: {
            title: true,
            slug: true,
          }
        })

        // Send email if parent comment has notifications enabled
        if (parentComment?.notifyByEmail && project) {
          const recipientEmail = parentComment.notificationEmail || parentComment.authorEmail
          
          if (recipientEmail) {
            const shareUrl = await generateShareUrl(project.slug)
            
            // Fire and forget - don't wait for email to send
            sendReplyNotificationEmail({
              clientEmail: recipientEmail,
              clientName: parentComment.authorName || 'Client',
              projectTitle: project.title,
              commentContent: parentComment.content,
              replyContent: content,
              shareUrl,
            }).then(() => {
              // Email sent successfully
            }).catch((err) => {
              console.error('Email send error:', err)
            })
          }
        }
        } catch (emailError) {
          console.error('Failed to send reply notification:', emailError)
          // Don't fail the request if email sending fails
        }
      }
    }

    // Send email notification to admins if this is client feedback (not internal)
    if (!isInternal && !parentId) {
      // Check if SMTP is configured before attempting to send email
      const smtpConfigured = await isSmtpConfigured()
      if (smtpConfigured) {
        try {
          // Get all admin emails
          const admins = await prisma.user.findMany({
          where: { role: 'ADMIN' },
          select: { email: true }
        })

        if (admins.length > 0) {
          // Get project and video details
          const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { title: true }
          })

          const video = videoId ? await prisma.video.findUnique({
            where: { id: videoId },
            select: { versionLabel: true }
          }) : null

          if (project) {
            // Fire and forget - don't wait for email to send
            sendAdminNewFeedbackEmail({
              adminEmails: admins.map((a: { email: string }) => a.email),
              clientName: authorName || 'Client',
              projectTitle: project.title,
              commentContent: content,
              timestamp: timestamp !== null && timestamp !== undefined ? timestamp : undefined,
              versionLabel: video?.versionLabel,
            }).then(() => {
              // Email sent successfully
            }).catch((err) => {
              console.error('Admin email send error:', err)
            })
          }
        }
        } catch (emailError) {
          console.error('Failed to send admin notification:', emailError)
          // Don't fail the request if email sending fails
        }
      }
    }

    // Return all comments for the project (to keep UI in sync)
    const allComments = await prisma.comment.findMany({
      where: {
        projectId,
        parentId: null, // Only get top-level comments
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
          }
        },
        replies: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                username: true,
                email: true,
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'asc' }
    })

    // Sanitize the response data
    const sanitizedComments = allComments.map((comment: any) => sanitizeComment(comment, !!currentUser))

    return NextResponse.json(sanitizedComments)
  } catch (error) {
    console.error('Error creating comment:', error)
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}
