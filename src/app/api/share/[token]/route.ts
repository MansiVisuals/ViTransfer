import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { generateVideoAccessToken } from '@/lib/video-access'
import { isSmtpConfigured, getClientSessionTimeoutSeconds, isHttpsEnabled } from '@/lib/settings'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { getPrimaryRecipient, getProjectRecipients } from '@/lib/recipients'
import { verifyProjectAccess } from '@/lib/project-access'
import crypto from 'crypto'
import { rateLimit } from '@/lib/rate-limit'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

/**
 * GET /api/share/[token]
 *
 * Main share page data endpoint
 * Comments are loaded separately via /api/share/[token]/comments for security
 */
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

    // Fetch project with videos (comments loaded separately for security)
    const project = await prisma.project.findUnique({
      where: { slug: token },
      include: {
        videos: {
          where: videoFilter,
          orderBy: { version: 'desc' },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Verify project access using dual auth pattern
    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword)

    if (!accessCheck.authorized) {
      // Return password required error for share page
      return NextResponse.json({
        error: 'Password required',
        requiresPassword: true
      }, { status: 401 })
    }

    const { isAdmin } = accessCheck

    // Get or create session ID for this share access
    const cookieStore = await cookies()
    let sessionId = cookieStore.get('share_session')?.value
    let isNewSession = false

    if (!sessionId) {
      // Generate new session ID (cryptographically secure)
      sessionId = crypto.randomBytes(16).toString('base64url')
      isNewSession = true

      // Get configurable client session timeout and HTTPS setting
      const sessionTimeoutSeconds = await getClientSessionTimeoutSeconds()
      const httpsEnabled = await isHttpsEnabled()

      // Set generic session cookie (no project ID exposure)
      cookieStore.set({
        name: 'share_session',
        value: sessionId,
        path: '/',
        httpOnly: true,
        secure: httpsEnabled,
        sameSite: 'strict',
        maxAge: sessionTimeoutSeconds,
      })

      // Store session → project mapping in Redis (server-side only)
      const redis = await import('@/lib/video-access').then(m => m.getRedis())
      await redis.set(
        `session_project:${sessionId}`,
        project.id,
        'EX',
        sessionTimeoutSeconds
      )

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

    // Sort video groups by approval status (unapproved first, approved last)
    // This helps clients see which videos still need approval at the top
    const sortedVideosByName: Record<string, any[]> = {}
    const sortedKeys = Object.keys(videosByName).sort((nameA, nameB) => {
      // Check if ANY version is approved in each group
      const hasApprovedA = videosByName[nameA].some((v: any) => v.approved)
      const hasApprovedB = videosByName[nameB].some((v: any) => v.approved)

      // Groups with no approved versions come first, groups with any approved versions come last
      if (hasApprovedA !== hasApprovedB) {
        return hasApprovedA ? 1 : -1
      }
      // If both have same approval status, maintain original order
      return 0
    })

    // Rebuild videosByName with sorted keys
    sortedKeys.forEach(key => {
      sortedVideosByName[key] = videosByName[key]
    })

    // Convert BigInt fields to strings for JSON serialization
    const smtpConfigured = await isSmtpConfigured()

    // Get primary recipient for display
    const primaryRecipient = await getPrimaryRecipient(project.id)

    let allRecipients: Array<{id: string, name: string | null}> = []
    if (project.sharePassword || isAdmin) {
      const recipients = await getProjectRecipients(project.id)
      allRecipients = recipients
        .filter(r => r.id)
        .map(r => ({
          id: r.id!,
          name: r.name
        }))
    }

    // SECURITY: Sanitize project data - only send required fields
    // Never expose: sharePassword, createdById, watermarkText, internal IDs
    const projectData = {
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,

      // SECURITY: Only include clientName/clientEmail for password-protected shares OR admins
      // Rationale: Password protection implies client expects privacy
      // Non-protected shares remain anonymous for client safety
      ...(project.sharePassword || isAdmin ? {
        clientName: project.companyName || primaryRecipient?.name || 'Client',
        clientEmail: primaryRecipient?.email || null,
        recipients: allRecipients, // All recipients for comment author selection
      } : {}),

      enableRevisions: project.enableRevisions,
      maxRevisions: project.maxRevisions,
      restrictCommentsToLatestVersion: project.restrictCommentsToLatestVersion,
      hideFeedback: project.hideFeedback,
      previewResolution: project.previewResolution,
      watermarkEnabled: project.watermarkEnabled,

      // Processed data
      videos: videosWithTokens,
      videosByName: sortedVideosByName,
      smtpConfigured,

      // REMOVED: comments (now loaded separately via /api/share/[token]/comments)
      // NEVER send: sharePassword, createdById, watermarkText, approvedVideoId, approvedAt
    }

    return NextResponse.json(projectData)
  } catch (error) {
    // Generic error response - no details exposed
    return NextResponse.json({
      error: 'Unable to process request'
    }, { status: 500 })
  }
}
