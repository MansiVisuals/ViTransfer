import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { generateVideoAccessToken } from '@/lib/video-access'
import { isSmtpConfigured } from '@/lib/settings'
import { getCurrentUserFromRequest } from '@/lib/auth'
import crypto from 'crypto'
import { rateLimit } from '@/lib/rate-limit'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

/**
 * Sanitize comment data - Zero PII exposure
 * Clients never see real names or emails
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

  if (isAdmin) {
    // Admins get real data
    sanitized.authorName = comment.authorName
    sanitized.authorEmail = comment.authorEmail
    sanitized.notifyByEmail = comment.notifyByEmail
    sanitized.notificationEmail = comment.notificationEmail
    sanitized.userId = comment.userId
  } else {
    // Clients ONLY see generic labels
    sanitized.authorName = comment.isInternal ? 'Admin' : 'Client'
  }

  // Recursively sanitize replies
  if (comment.replies && Array.isArray(comment.replies)) {
    sanitized.replies = comment.replies.map((reply: any) => sanitizeComment(reply, isAdmin))
  }

  return sanitized
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    // Rate limiting: Max 100 requests per 15 minutes to prevent scraping
    const rateLimitResult = await rateLimit(request, {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100,
      message: 'Too many requests. Please try again later.'
    }, `share-access:${token}`)
    if (rateLimitResult) return rateLimitResult

    // Always show all ready videos, regardless of project approval status
    // Individual videos can be approved independently
    const videoFilter = { status: 'READY' as const }

    // Try to fetch with replies first, fallback to simple fetch if it fails
    let project
    try {
      project = await prisma.project.findUnique({
        where: { slug: token },
        include: {
          videos: {
            where: videoFilter,
            orderBy: { version: 'desc' },
          },
          comments: {
            where: { parentId: null },
            include: {
              replies: {
                orderBy: { createdAt: 'asc' }
              }
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
    } catch (includeError) {
      console.error('Error with nested comments, falling back to simple query:', includeError)
      // Fallback to simple query without nested replies
      project = await prisma.project.findUnique({
        where: { slug: token },
        include: {
          videos: {
            where: videoFilter,
            orderBy: { version: 'desc' },
          },
          comments: {
            orderBy: { createdAt: 'asc' },
          },
        },
      })
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Check authentication if password protected
    if (project.sharePassword) {
      const cookieStore = await cookies()
      const authToken = cookieStore.get(`share_auth_${project.id}`)

      if (authToken?.value !== 'true') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    // Check if user is admin for data sanitization
    const currentUser = await getCurrentUserFromRequest(request)
    const isAdmin = !!currentUser

    // Get or create session ID for this share access
    const cookieStore = await cookies()
    let sessionId = cookieStore.get(`share_session_${project.id}`)?.value
    let isNewSession = false

    if (!sessionId) {
      // Generate new session ID (cryptographically secure)
      sessionId = crypto.randomBytes(16).toString('base64url')
      isNewSession = true

      // Set session cookie (15 minutes - same as video tokens)
      cookieStore.set({
        name: `share_session_${project.id}`,
        value: sessionId,
        path: '/',
        httpOnly: true,
        secure: false, // Match auth cookie settings
        sameSite: 'strict',
        maxAge: 15 * 60, // 15 minutes
      })

      // Track page visit for new sessions only (don't count admins)
      // Create ONE analytics entry per project visit (using the first video as reference)
      if (!isAdmin && project.videos.length > 0) {
        // Use the first video as a reference for the page visit
        // This ensures only ONE PAGE_VISIT is tracked per actual page visit
        const firstVideo = project.videos[0]

        await prisma.videoAnalytics.create({
          data: {
            videoId: firstVideo.id,
            projectId: project.id,
            eventType: 'PAGE_VISIT',
          }
        }).catch(() => {
          // Silently fail - analytics should not break the request
        })
      }
    }

    // Generate video access tokens for all videos
    const videosWithTokens = await Promise.all(
      project.videos.map(async (video: any) => {
        // If video is approved, use original quality for streaming AND download
        // If not approved, use preview/watermarked versions for streaming
        let streamToken720p: string
        let streamToken1080p: string
        let downloadToken: string | null = null

        if (video.approved) {
          // APPROVED: Stream original (no watermark) + allow download
          const originalToken = await generateVideoAccessToken(
            video.id,
            project.id,
            'original',
            request,
            sessionId!
          )

          // Use original for both streaming and download
          streamToken720p = originalToken
          streamToken1080p = originalToken
          downloadToken = originalToken
        } else {
          // NOT APPROVED: Stream watermarked previews, no download
          streamToken720p = await generateVideoAccessToken(
            video.id,
            project.id,
            '720p',
            request,
            sessionId!
          )

          streamToken1080p = await generateVideoAccessToken(
            video.id,
            project.id,
            '1080p',
            request,
            sessionId!
          )
        }

        return {
          ...video,
          // Convert BigInt to string
          originalFileSize: video.originalFileSize.toString(),

          // Provide token-based URLs
          // For approved videos: these point to original (no watermark)
          // For unapproved videos: these point to watermarked previews
          streamUrl720p: `/api/content/${streamToken720p}`,
          streamUrl1080p: `/api/content/${streamToken1080p}`,
          downloadUrl: downloadToken ? `/api/content/${downloadToken}?download=true` : null,

          // Remove actual file paths from response (security)
          preview720Path: undefined,
          preview1080Path: undefined,
          originalStoragePath: undefined,
          thumbnailPath: undefined,
        }
      })
    )

    // Group videos by name
    const videosByName = videosWithTokens.reduce((acc: any, video: any) => {
      const name = video.name
      if (!acc[name]) {
        acc[name] = []
      }
      acc[name].push(video)
      return acc
    }, {})

    // Sort videos within each group by version (descending)
    Object.keys(videosByName).forEach(name => {
      videosByName[name].sort((a: any, b: any) => b.version - a.version)
    })

    // Convert BigInt fields to strings for JSON serialization
    const smtpConfigured = await isSmtpConfigured()

    // Sanitize comments - never expose PII to non-admins
    const sanitizedComments = project.comments
      ? project.comments.map((comment: any) => sanitizeComment(comment, isAdmin))
      : []

    const projectData = {
      ...project,
      videos: videosWithTokens, // Keep for backward compatibility
      videosByName, // New grouped structure for multi-video support
      comments: sanitizedComments,
      smtpConfigured, // Include SMTP status for frontend
    }

    return NextResponse.json(projectData)
  } catch (error) {
    console.error('Error fetching project:', error)
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack)
    }
    // SECURITY: Generic message - don't reveal what failed or system architecture
    return NextResponse.json({
      error: 'Unable to process request'
    }, { status: 500 })
  }
}
