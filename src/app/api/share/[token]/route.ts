import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { generateVideoAccessToken } from '@/lib/video-access'
import { isSmtpConfigured, getClientSessionTimeoutSeconds, isHttpsEnabled } from '@/lib/settings'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { getPrimaryRecipient, getProjectRecipients } from '@/lib/recipients'
import { verifyProjectAccess } from '@/lib/project-access'
import { getRedis } from '@/lib/redis'
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

    // First, fetch project metadata
    const projectMeta = await prisma.project.findUnique({
      where: { slug: token },
      select: {
        id: true,
        guestMode: true,
        guestLatestOnly: true,
        sharePassword: true,
        authMode: true,
      },
    })

    if (!projectMeta) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // SECURITY: Determine if this is a guest session
    const cookieStore = await cookies()
    let sessionId = cookieStore.get('share_session')?.value
    const redis = await getRedis()

    // User is a guest if:
    // 1. Project has guestMode enabled, AND
    // 2. User has an active guest_session in Redis
    const isGuestSession = sessionId ? await redis.exists(`guest_session:${sessionId}`) : 0
    const isGuest = projectMeta.guestMode && isGuestSession === 1

    // SECURITY: For guests with guestLatestOnly, we need to fetch only latest versions
    // This prevents data leakage via API inspection
    let project
    if (isGuest && projectMeta.guestLatestOnly) {
      // Fetch all ready videos to determine latest per name
      const allVideos = await prisma.video.findMany({
        where: {
          projectId: projectMeta.id,
          status: 'READY',
        },
        orderBy: { version: 'desc' },
      })

      // Group by name and get latest version ID for each
      const latestVideoIds: string[] = []
      const seenNames = new Set<string>()
      for (const video of allVideos) {
        if (!seenNames.has(video.name)) {
          latestVideoIds.push(video.id)
          seenNames.add(video.name)
        }
      }

      // Now fetch full project with ONLY the latest videos
      project = await prisma.project.findUnique({
        where: { slug: token },
        include: {
          videos: {
            where: {
              id: { in: latestVideoIds },
              status: 'READY',
            },
            orderBy: { version: 'desc' },
          },
        },
      })
    } else {
      // For non-guests or guests without latestOnly, fetch all ready videos
      project = await prisma.project.findUnique({
        where: { slug: token },
        include: {
          videos: {
            where: { status: 'READY' as const },
            orderBy: { version: 'desc' },
          },
        },
      })
    }

    if (!project) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Verify project access using dual auth pattern
    const accessCheck = await verifyProjectAccess(request, projectMeta.id, projectMeta.sharePassword, projectMeta.authMode)

    if (!accessCheck.authorized) {
      // Return password required error for share page
      return NextResponse.json({
        error: 'Authentication required',
        requiresPassword: true,
        authMode: project.authMode || 'PASSWORD',
        guestMode: project.guestMode || false
      }, { status: 401 })
    }

    const { isAdmin } = accessCheck

    // If guestMode is enabled and user is not admin, require guest session entry
    if (projectMeta.guestMode && !isAdmin && !isGuest) {
      // User needs to explicitly enter as guest
      return NextResponse.json({
        error: 'Guest entry required',
        requiresPassword: false,
        authMode: projectMeta.authMode,
        guestMode: true
      }, { status: 401 })
    }

    // Get or create session ID for this share access
    let isNewSession = false

    // Get configurable client session timeout and HTTPS setting
    const sessionTimeoutSeconds = await getClientSessionTimeoutSeconds()
    const httpsEnabled = await isHttpsEnabled()

    if (!sessionId) {
      // Generate new session ID (cryptographically secure)
      sessionId = crypto.randomBytes(16).toString('base64url')
      isNewSession = true

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
    }

    // Store session → project mapping in Redis (always, for new or existing sessions)
    // Add project to session's authorized projects set
    await redis.sadd(`session_projects:${sessionId}`, project.id)
    // Refresh TTL on the entire set
    await redis.expire(`session_projects:${sessionId}`, sessionTimeoutSeconds)

    if (isNewSession) {
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

    // Note: For guests with guestLatestOnly, filtering already happened at DB level
    // So videosByName and videosWithTokens already contain only allowed videos

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

    // Get global settings for share page
    const globalSettings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        companyName: true,
        defaultPreviewResolution: true,
      },
    })

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

    // SECURITY: Sanitize video data for guests
    // Guests should only see minimal information required for playback
    const sanitizedVideos = isGuest ? videosWithTokens.map(video => ({
      id: video.id,
      name: video.name,
      version: video.version,
      versionLabel: video.versionLabel,
      duration: video.duration,
      width: video.width,
      height: video.height,
      fps: video.fps,
      status: video.status,
      streamUrl720p: video.streamUrl720p,
      streamUrl1080p: video.streamUrl1080p,
      downloadUrl: video.downloadUrl,
    })) : videosWithTokens

    // SECURITY: Sanitize videosByName for guests
    const sanitizedVideosByName = isGuest ? Object.keys(sortedVideosByName).reduce((acc: any, name: string) => {
      acc[name] = sortedVideosByName[name].map(video => ({
        id: video.id,
        name: video.name,
        version: video.version,
        versionLabel: video.versionLabel,
        duration: video.duration,
        width: video.width,
        height: video.height,
        fps: video.fps,
        status: video.status,
        streamUrl720p: video.streamUrl720p,
        streamUrl1080p: video.streamUrl1080p,
        downloadUrl: video.downloadUrl,
      }))
      return acc
    }, {}) : sortedVideosByName

    // SECURITY: Sanitize project data - only send required fields
    // Never expose: sharePassword, createdById, watermarkText, internal IDs
    const projectData = {
      // Only include project ID for non-guests (needed for admin operations)
      ...(isGuest ? {} : { id: project.id }),

      title: project.title,
      description: project.description,

      // Only include status for non-guests (internal workflow info)
      ...(isGuest ? {} : { status: project.status }),

      guestMode: project.guestMode || false,
      isGuest: isGuest, // Tell frontend if this is a guest session

      // SECURITY: Only include clientName/clientEmail for password-protected shares OR admins (NOT for guests)
      // Rationale: Password protection implies client expects privacy
      // Non-protected shares remain anonymous for client safety
      ...((project.sharePassword || isAdmin) && !isGuest ? {
        clientName: project.companyName || primaryRecipient?.name || 'Client',
        clientEmail: primaryRecipient?.email || null,
        companyName: project.companyName || null, // Client company name for comment display
        recipients: allRecipients, // All recipients for comment author selection
      } : {}),

      // Only include these settings for non-guests (internal project configuration)
      ...(isGuest ? {} : {
        enableRevisions: project.enableRevisions,
        maxRevisions: project.maxRevisions,
        restrictCommentsToLatestVersion: project.restrictCommentsToLatestVersion,
        hideFeedback: project.hideFeedback,
        previewResolution: project.previewResolution,
        watermarkEnabled: project.watermarkEnabled,
      }),

      // Asset download setting needed for UI logic (show/hide download button)
      allowAssetDownload: project.allowAssetDownload,

      // Processed data (sanitized for guests)
      videos: sanitizedVideos,
      videosByName: sanitizedVideosByName,

      // Only include SMTP status for non-guests (needed for notification features)
      ...(isGuest ? {} : { smtpConfigured }),

      // Global settings (safe to expose publicly)
      settings: {
        companyName: globalSettings?.companyName || 'Studio',
        defaultPreviewResolution: globalSettings?.defaultPreviewResolution || '720p',
      },

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
