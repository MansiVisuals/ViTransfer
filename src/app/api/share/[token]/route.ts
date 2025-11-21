import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { generateVideoAccessToken } from '@/lib/video-access'
import { isSmtpConfigured, getClientSessionTimeoutSeconds, isHttpsEnabled } from '@/lib/settings'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { getPrimaryRecipient, getProjectRecipients } from '@/lib/recipients'
import { verifyProjectAccess, fetchProjectWithVideos } from '@/lib/project-access'
import { getRedis } from '@/lib/redis'
import crypto from 'crypto'
import { rateLimit } from '@/lib/rate-limit'
export const runtime = 'nodejs'




export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    const rateLimitResult = await rateLimit(request, {
      windowMs: 15 * 60 * 1000,
      maxRequests: 100,
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

    const cookieStore = await cookies()
    let sessionId = cookieStore.get('share_session')?.value
    const redis = await getRedis()

    const isGuestSession = sessionId ? await redis.exists(`guest_session:${sessionId}`) : 0
    const isGuest = projectMeta.guestMode && isGuestSession === 1

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

    if (projectMeta.guestMode && !isAdmin && !isGuest) {
      return NextResponse.json({
        error: 'Guest entry required',
        requiresPassword: false,
        authMode: projectMeta.authMode,
        guestMode: true
      }, { status: 401 })
    }

    let isNewSession = false
    const sessionTimeoutSeconds = await getClientSessionTimeoutSeconds()
    const httpsEnabled = await isHttpsEnabled()

    if (!sessionId) {
      sessionId = crypto.randomBytes(16).toString('base64url')
      isNewSession = true

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

    await redis.sadd(`session_projects:${sessionId}`, project.id)
    await redis.expire(`session_projects:${sessionId}`, sessionTimeoutSeconds)

    if (isNewSession) {
      if (!isAdmin && project.videos.length > 0) {
        const firstVideo = project.videos[0]

        await prisma.videoAnalytics.create({
          data: {
            videoId: firstVideo.id,
            projectId: project.id,
            eventType: 'PAGE_VISIT',
          }
        }).catch(() => {})
      }
    }

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
            sessionId!
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

    return NextResponse.json(projectData)
  } catch (error) {
    return NextResponse.json({
      error: 'Unable to process request'
    }, { status: 500 })
  }
}
