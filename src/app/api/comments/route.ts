import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { validateRequest, createCommentSchema } from '@/lib/validation'
import { isSmtpConfigured } from '@/lib/settings'
import { getPrimaryRecipient } from '@/lib/recipients'
import { verifyProjectAccess } from '@/lib/project-access'
import { sanitizeComment } from '@/lib/comment-sanitization'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'
import { sanitizeCommentHtml, validateCommentLength, containsSuspiciousPatterns } from '@/lib/security/html-sanitization'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/comments?projectId=xxx
 * Fetch all comments for a project
 */
export async function GET(request: NextRequest) {
  // Rate limiting: 60 requests per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many requests. Please slow down.'
  }, 'comments-read')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    // Fetch the project to check password protection
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        sharePassword: true,
        authMode: true,
        companyName: true,
        hideFeedback: true,
        guestMode: true,
      }
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // SECURITY: If feedback is hidden, return empty array (don't expose comments)
    if (project.hideFeedback) {
      return NextResponse.json([])
    }

    // SECURITY: Block guest access to comments (guests should only see videos)
    if (project.guestMode) {
      const { cookies } = await import('next/headers')
      const { getRedis } = await import('@/lib/redis')
      const cookieStore = await cookies()
      const sessionId = cookieStore.get('share_session')?.value

      if (sessionId) {
        const redis = await getRedis()
        const isGuestSession = await redis.exists(`guest_session:${sessionId}`)

        if (isGuestSession === 1) {
          return NextResponse.json([])
        }
      }
    }

    // Verify project access using dual auth pattern
    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword, project.authMode)

    if (!accessCheck.authorized) {
      return accessCheck.errorResponse!
    }

    const { isAdmin, isAuthenticated } = accessCheck

    // Get primary recipient for author name fallback
    const primaryRecipient = await getPrimaryRecipient(projectId)
    // Priority: companyName → primary recipient → 'Client'
    const fallbackName = project.companyName || primaryRecipient?.name || 'Client'

    // Fetch all comments for the project
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
    const sanitizedComments = allComments.map((comment: any) =>
      sanitizeComment(comment, isAdmin, isAuthenticated, fallbackName)
    )

    return NextResponse.json(sanitizedComments)
  } catch (error) {
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // CSRF Protection
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

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
      recipientId,
      parentId,
      isInternal
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
        authMode: true,
        companyName: true,
        hideFeedback: true,
        guestMode: true,
      }
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // SECURITY: If feedback is hidden, reject comment creation
    if (project.hideFeedback) {
      return NextResponse.json(
        { error: 'Comments are disabled for this project' },
        { status: 403 }
      )
    }

    // SECURITY: Block guest comment creation (guests should only view videos)
    if (project.guestMode) {
      const { cookies } = await import('next/headers')
      const { getRedis } = await import('@/lib/redis')
      const cookieStore = await cookies()
      const sessionId = cookieStore.get('share_session')?.value

      if (sessionId) {
        const redis = await getRedis()
        const isGuestSession = await redis.exists(`guest_session:${sessionId}`)

        if (isGuestSession === 1) {
          return NextResponse.json(
            { error: 'Comments are disabled for guest users' },
            { status: 403 }
          )
        }
      }
    }

    // Get primary recipient for author name
    const primaryRecipient = await getPrimaryRecipient(projectId)
    // Priority: companyName → primary recipient → 'Client'
    const fallbackName = project.companyName || primaryRecipient?.name || 'Client'

    // Verify project access using dual auth pattern
    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword, project.authMode)

    if (!accessCheck.authorized) {
      // Don't reveal if project exists - return generic error
      return NextResponse.json(
        { error: 'Unable to process request' },
        { status: 400 }
      )
    }

    const { isAdmin, isAuthenticated } = accessCheck

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

    let finalAuthorEmail = authorEmail

    if (recipientId) {
      const recipient = await prisma.projectRecipient.findUnique({
        where: { id: recipientId },
        select: { email: true, projectId: true }
      })

      if (recipient && recipient.projectId === projectId) {
        finalAuthorEmail = recipient.email
      }
    }

    // Sanitize authorName (same rules as watermark text)
    let sanitizedAuthorName = authorName || null
    if (sanitizedAuthorName) {
      // Remove invalid characters
      const invalidChars = sanitizedAuthorName.match(/[^a-zA-Z0-9\s\-_.()]/g)
      if (invalidChars) {
        return NextResponse.json(
          {
            error: 'Invalid characters in name',
            details: `Name can only contain letters, numbers, spaces, and these characters: - _ . ( )`
          },
          { status: 400 }
        )
      }

      // Length check
      if (sanitizedAuthorName.length > 50) {
        return NextResponse.json(
          { error: 'Name is too long (max 50 characters)' },
          { status: 400 }
        )
      }

      // Trim whitespace
      sanitizedAuthorName = sanitizedAuthorName.trim()
    }

    // SECURITY: Server-side HTML sanitization to prevent XSS
    // Validate content length
    if (!validateCommentLength(content)) {
      return NextResponse.json(
        { error: 'Comment is too long (max 10,000 characters)' },
        { status: 400 }
      )
    }

    // Check for suspicious patterns
    if (containsSuspiciousPatterns(content)) {
      return NextResponse.json(
        { error: 'Comment contains potentially malicious content' },
        { status: 400 }
      )
    }

    // Sanitize HTML content
    const sanitizedContent = sanitizeCommentHtml(content)

    const comment = await prisma.comment.create({
      data: {
        projectId,
        videoId,
        videoVersion: finalVideoVersion || null,
        timestamp: timestamp !== null && timestamp !== undefined ? timestamp : null,
        content: sanitizedContent, // Store sanitized content
        authorName: sanitizedAuthorName,
        authorEmail: finalAuthorEmail || null,
        isInternal: isInternal || false,
        parentId: parentId || null,
        userId: currentUser?.id || null,
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

    // Unified notification system (Phase 3)
    try {
      // Check if SMTP is configured
      const smtpConfigured = await isSmtpConfigured()
      console.log('[COMMENT-NOTIFICATION] SMTP configured:', smtpConfigured)

      if (smtpConfigured) {
        // Get project with notification schedule
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: {
            id: true,
            title: true,
            slug: true,
            clientNotificationSchedule: true,
          }
        })

        if (project) {
          // Get video info
          const video = videoId ? await prisma.video.findUnique({
            where: { id: videoId },
            select: { name: true, versionLabel: true }
          }) : null

          console.log('[COMMENT-NOTIFICATION] Video:', video?.name || 'None')

          // Get settings for admin schedule
          const settings = await prisma.settings.findUnique({
            where: { id: 'default' },
            select: { adminNotificationSchedule: true }
          })

          // Determine which schedule to use
          const isAdminComment = comment.isInternal
          const schedule = isAdminComment
            ? project.clientNotificationSchedule // Admin replies use client schedule
            : (settings?.adminNotificationSchedule || 'IMMEDIATE') // Client comments use admin schedule

          console.log(`[COMMENT-NOTIFICATION] Comment type: ${isAdminComment ? 'ADMIN' : 'CLIENT'}, Schedule: ${schedule}`)

          const context = {
            comment,
            project: { id: project.id, title: project.title, slug: project.slug },
            video,
            isReply: !!parentId
          }

          // Handle notification based on schedule
          if (schedule === 'IMMEDIATE') {
            console.log('[COMMENT-NOTIFICATION] Sending immediately...')
            const { sendImmediateNotification } = await import('@/lib/notifications')
            await sendImmediateNotification(context)
          } else {
            console.log(`[COMMENT-NOTIFICATION] Queuing for later (${schedule})...`)
            const { queueNotification } = await import('@/lib/notifications')
            await queueNotification(context)
          }
        } else {
          console.log('[COMMENT-NOTIFICATION] Project not found')
        }
      } else {
        console.log('[COMMENT-NOTIFICATION] Skipping - SMTP not configured')
      }
    } catch (emailError) {
      // Don't fail the request if notification processing fails
      console.error('[COMMENT-NOTIFICATION] Error processing notification:', emailError)
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
    const sanitizedComments = allComments.map((comment: any) => sanitizeComment(comment, isAdmin, isAuthenticated, fallbackName))

    return NextResponse.json(sanitizedComments)
  } catch (error) {
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}
