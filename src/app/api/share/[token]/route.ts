import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateVideoAccessToken } from '@/lib/video-access'
import { isSmtpConfigured, getRateLimitSettings, getShareTokenTtlSeconds } from '@/lib/settings'
import { getCurrentUserFromRequest, getShareContext, signShareToken } from '@/lib/auth'
import { getPrimaryRecipient, getProjectRecipients } from '@/lib/recipients'
import { verifyProjectAccess, fetchProjectWithVideos } from '@/lib/project-access'
import { rateLimit } from '@/lib/rate-limit'
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

    const hasShareSession = !!shareContext
    if (projectMeta.guestMode && !isAdmin && !hasShareSession && !isGuest) {
      return NextResponse.json({
        error: 'Guest entry required',
        requiresPassword: false,
        authMode: projectMeta.authMode,
        guestMode: true
      }, { status: 401 })
    }

    const sessionId = accessCheck.shareTokenSessionId || `share:${project.id}:${token}`

    const videosWithTokens = await Promise.all(
      project.videos.map(async (video: any) => {
        let streamToken720p: string
        let streamToken1080p: string
        let downloadToken: string | null = null

        if (video.approved) {
          const originalToken = await generateVideoAccessToken(
            video.id,
            project.id,
            'original',
            request,
            accessCheck.shareTokenSessionId || sessionId
          )

          streamToken720p = originalToken
          streamToken1080p = originalToken
          downloadToken = originalToken
        } else {
          streamToken720p = await generateVideoAccessToken(
            video.id,
            project.id,
            '720p',
            request,
            accessCheck.shareTokenSessionId || sessionId
          )

          streamToken1080p = await generateVideoAccessToken(
            video.id,
            project.id,
            '1080p',
            request,
            accessCheck.shareTokenSessionId || sessionId
          )
        }

        let thumbnailUrl: string | null = null
        if (video.thumbnailPath) {
          const thumbnailToken = await generateVideoAccessToken(
            video.id,
            project.id,
            'thumbnail',
            request,
            sessionId!
          )
          thumbnailUrl = `/api/content/${thumbnailToken}`
        }

        return {
          ...video,
          originalFileSize: video.originalFileSize.toString(),

          streamUrl720p: `/api/content/${streamToken720p}`,
          streamUrl1080p: `/api/content/${streamToken1080p}`,
          downloadUrl: downloadToken ? `/api/content/${downloadToken}?download=true` : null,
          thumbnailUrl,

          preview720Path: undefined,
          preview1080Path: undefined,
          originalStoragePath: undefined,
          thumbnailPath: undefined,
        }
      })
    )

    const videosByName = videosWithTokens.reduce((acc: any, video: any) => {
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

    const smtpConfigured = await isSmtpConfigured()

    const globalSettings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        companyName: true,
        defaultPreviewResolution: true,
      },
    })

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
      thumbnailUrl: video.thumbnailUrl,
    })) : videosWithTokens

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

      ...((project.sharePassword || isAdmin) && !isGuest ? {
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
