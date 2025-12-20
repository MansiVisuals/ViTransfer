import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isSmtpConfigured, getRateLimitSettings, getShareTokenTtlSeconds } from '@/lib/settings'
import { getCurrentUserFromRequest, getShareContext, signShareToken, parseBearerToken } from '@/lib/auth'
import { getPrimaryRecipient, getProjectRecipients } from '@/lib/recipients'
import { verifyProjectAccess, fetchProjectWithVideos } from '@/lib/project-access'
import { rateLimit } from '@/lib/rate-limit'
import { trackSharePageAccess } from '@/lib/share-access-tracking'
import { getRedis } from '@/lib/redis'
import crypto from 'crypto'
export const runtime = 'nodejs'




export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const { ipRateLimit } = await getRateLimitSettings()
    const shareTtlSeconds = await getShareTokenTtlSeconds()

    const rateLimitResult = await rateLimit(request, {
      windowMs: 15 * 60 * 1000,
      maxRequests: ipRateLimit || 100,
      message: 'Too many requests. Please try again later.'
    }, `share-access:${token}`)
    if (rateLimitResult) return rateLimitResult

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

    const shareContext = await getShareContext(request)
    const isGuest = !!shareContext?.guest

    // SECURITY: If user sent a bearer token but it failed verification (revoked, expired, invalid),
    // handle based on current authMode:
    // - NONE auth: Ignore invalid token, proceed as if no token sent
    // - PASSWORD/OTP/BOTH: Return 401 to force re-authentication
    const bearerToken = parseBearerToken(request)
    if (bearerToken && !shareContext && projectMeta.authMode !== 'NONE') {
      const currentUser = await getCurrentUserFromRequest(request)
      const isAdmin = currentUser?.role === 'ADMIN'

      if (!isAdmin) {
        // Token was sent but invalid/revoked - force re-authentication
        return NextResponse.json({
          error: 'Session expired or invalid. Please authenticate again.',
          requiresPassword: true,
          authMode: projectMeta.authMode || 'PASSWORD',
          guestMode: projectMeta.guestMode || false
        }, { status: 401 })
      }
    }

    const project = await fetchProjectWithVideos(
      token,
      isGuest,
      projectMeta.guestLatestOnly || false,
      projectMeta.id
    )

    if (!project) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const accessCheck = await verifyProjectAccess(request, projectMeta.id, projectMeta.sharePassword, projectMeta.authMode)

    if (!accessCheck.authorized) {
      return NextResponse.json({
        error: 'Authentication required',
        requiresPassword: true,
        authMode: project.authMode || 'PASSWORD',
        guestMode: project.guestMode || false
      }, { status: 401 })
    }

    const { isAdmin } = accessCheck

    // Track share page access for projects with no authentication (authMode = NONE)
    // Only track as NONE if guest mode is disabled; otherwise let guest endpoint track as GUEST
    if (projectMeta.authMode === 'NONE' && !projectMeta.guestMode && !isAdmin) {
      // Use Redis for 30-minute deduplication
      const redis = getRedis()
      const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                       request.headers.get('x-real-ip') ||
                       'unknown'
      const dedupeKey = `share_access:${projectMeta.id}:${ipAddress}`
      const alreadyTracked = await redis.get(dedupeKey)

      if (!alreadyTracked) {
        // CRITICAL: Use deterministic sessionId for NONE authMode
        // This must match the sessionId used in JWT token for session invalidation to work
        const sessionId = `none:${projectMeta.id}:${ipAddress}`

        await trackSharePageAccess({
          projectId: projectMeta.id,
          accessMethod: 'NONE',
          sessionId,
          request,
        })

        // Set 30-minute deduplication window
        await redis.set(dedupeKey, '1', 'EX', 30 * 60)
      }
    }

    const hasShareSession = !!shareContext
    // If guestMode is enabled, require guest token (restricted access)
    // This applies to ALL authModes - guest restrictions are independent of auth requirements
    if (projectMeta.guestMode && !isAdmin && !hasShareSession && !isGuest) {
      return NextResponse.json({
        error: 'Guest entry required',
        requiresPassword: false,
        authMode: projectMeta.authMode,
        guestMode: true
      }, { status: 401 })
    }

    const videosSanitizedBase = project.videos.map((video: any) => ({
      ...video,
      originalFileSize: video.originalFileSize.toString(),
      streamUrl720p: '',
      streamUrl1080p: '',
      downloadUrl: null,
      thumbnailUrl: null,
      preview720Path: undefined,
      preview1080Path: undefined,
      originalStoragePath: undefined,
      thumbnailPath: undefined,
    }))

    const videosByName = videosSanitizedBase.reduce((acc: any, video: any) => {
      const name = video.name
      if (!acc[name]) {
        acc[name] = []
      }
      acc[name].push(video)
      return acc
    }, {})

    Object.keys(videosByName).forEach(name => {
      videosByName[name].sort((a: any, b: any) => b.version - a.version)
    })

    const sortedVideosByName: Record<string, any[]> = {}
    const sortedKeys = Object.keys(videosByName).sort((nameA, nameB) => {
      const hasApprovedA = videosByName[nameA].some((v: any) => v.approved)
      const hasApprovedB = videosByName[nameB].some((v: any) => v.approved)

      if (hasApprovedA !== hasApprovedB) {
        return hasApprovedA ? 1 : -1
      }
      return 0
    })

    sortedKeys.forEach(key => {
      sortedVideosByName[key] = videosByName[key]
    })

    // Parallelize independent queries for better performance
    const [smtpConfigured, globalSettings, primaryRecipient] = await Promise.all([
      isSmtpConfigured(),
      prisma.settings.findUnique({
        where: { id: 'default' },
        select: {
          companyName: true,
          defaultPreviewResolution: true,
        },
      }),
      getPrimaryRecipient(project.id)
    ])

    let allRecipients: Array<{id: string, name: string | null}> = []
    // Include recipients for all authenticated users (guest mode is the only restriction)
    if (!isGuest) {
      const recipients = await getProjectRecipients(project.id)
      allRecipients = recipients
        .filter(r => r.id)
        .map(r => ({
          id: r.id!,
          name: r.name
        }))
    }

    const sanitizedVideos = isGuest ? videosSanitizedBase.map(video => ({
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
      thumbnailUrl: video.thumbnailUrl,
    })) : videosSanitizedBase

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
        thumbnailUrl: video.thumbnailUrl,
      }))
      return acc
    }, {}) : sortedVideosByName

    const projectData = {
      ...(isGuest ? {} : { id: project.id }),

      title: project.title,
      description: project.description,

      ...(isGuest ? {} : { status: project.status }),

      guestMode: project.guestMode || false,
      isGuest: isGuest,

      ...(!isGuest ? {
        clientName: project.companyName || primaryRecipient?.name || 'Client',
        clientEmail: primaryRecipient?.email || null,
        companyName: project.companyName || null,
        recipients: allRecipients,
      } : {}),

      ...(isGuest ? {} : {
        enableRevisions: project.enableRevisions,
        maxRevisions: project.maxRevisions,
        restrictCommentsToLatestVersion: project.restrictCommentsToLatestVersion,
        hideFeedback: project.hideFeedback,
        previewResolution: project.previewResolution,
        watermarkEnabled: project.watermarkEnabled,
      }),

      allowAssetDownload: project.allowAssetDownload,

      videos: sanitizedVideos,
      videosByName: sanitizedVideosByName,

      ...(isGuest ? {} : { smtpConfigured }),

      settings: {
        companyName: globalSettings?.companyName || 'Studio',
        defaultPreviewResolution: globalSettings?.defaultPreviewResolution || '720p',
      },
    }

    const responseBody: any = projectData

    // If no share token present, issue a short-lived viewer token (view-only) for this project
    if (!shareContext && !isAdmin) {
      // CRITICAL: For NONE authMode, use deterministic sessionId based on IP
      // This must match the sessionId used in SharePageAccess tracking
      let sessionId = accessCheck.shareTokenSessionId || `share:${project.id}:${token}`

      if (projectMeta.authMode === 'NONE') {
        const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                         request.headers.get('x-real-ip') ||
                         'unknown'
        sessionId = `none:${projectMeta.id}:${ipAddress}`
      }

      const shareToken = signShareToken({
        shareId: token,
        projectId: project.id,
        permissions: ['view', 'comment', 'download'],
        guest: false,
        sessionId,
        authMode: projectMeta.authMode,
        ttlSeconds: shareTtlSeconds,
      })
      responseBody.shareToken = shareToken
    }

    return NextResponse.json(responseBody)
  } catch (error) {
    return NextResponse.json({
      error: 'Unable to process request'
    }, { status: 500 })
  }
}
