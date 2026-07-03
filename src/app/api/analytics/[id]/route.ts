import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

// GET /api/analytics/[id] - Get detailed analytics for a specific project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const analyticsMessages = messages?.analytics || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting: 100 requests per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 100,
    message: analyticsMessages.tooManyRequestsSlowDown || 'Too many requests. Please slow down.'
  }, 'admin-analytics-detail')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        videos: {
          where: { status: 'READY' },
          orderBy: [
            { name: 'asc' },
            { version: 'desc' },
          ],
        },
        recipients: {
          where: { isPrimary: true },
          take: 1,
        },
        sharePageAccesses: {
          orderBy: { createdAt: 'desc' },
        },
        analytics: {
          where: { eventType: 'DOWNLOAD_COMPLETE' },
          orderBy: { createdAt: 'desc' },
          include: {
            video: {
              select: {
                id: true,
                name: true,
                versionLabel: true,
                originalFileName: true,
                assets: {
                  select: {
                    id: true,
                    fileName: true,
                    category: true,
                  },
                },
              },
            },
          },
        },
        photoAlbums: {
          select: {
            id: true,
            name: true,
            photos: { select: { id: true, fileName: true } },
          },
        },
        projectUploads: {
          where: { uploadCompletedAt: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            fileName: true,
            uploadedByName: true,
            uploadedByEmail: true,
            createdAt: true,
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: analyticsMessages.projectNotFound || 'Project not found' },
        { status: 404 }
      )
    }

    // Split analytics: video-bound rows vs photo download events (videoId null)
    const videoAnalyticsRows = project.analytics.filter(a => a.videoId && a.video)
    const photoAnalyticsRows = project.analytics.filter(a => !a.videoId)

    // Group videos by name
    const videosByName = project.videos.reduce((acc, video) => {
      if (!acc[video.name]) {
        acc[video.name] = []
      }
      acc[video.name].push(video)
      return acc
    }, {} as Record<string, typeof project.videos>)

    // Create stats grouped by video name
    const videoStats = Object.entries(videosByName).map(([videoName, versions]) => {
      // Get all video IDs for this video name
      const videoIds = versions.map(v => v.id)

      // Get all analytics for these video IDs
      const videoAnalytics = videoAnalyticsRows.filter(a => videoIds.includes(a.videoId!))
      const totalDownloads = videoAnalytics.length

      // Per-version breakdown
      const versionStats = versions.map(version => {
        const versionAnalytics = videoAnalyticsRows.filter(a => a.videoId === version.id)
        const downloads = versionAnalytics.length
        return {
          id: version.id,
          versionLabel: version.versionLabel,
          downloads,
        }
      })

      return {
        videoName,
        totalDownloads,
        versions: versionStats,
      }
    })

    // Calculate share page access stats
    // Use IP address for unique visitor count (sessionId changes on every re-authentication)
    const uniqueVisitors = new Set(project.sharePageAccesses.map(a => a.ipAddress).filter(Boolean)).size

    const accessByMethod = {
      OTP: project.sharePageAccesses.filter(a => a.accessMethod === 'OTP').length,
      PASSWORD: project.sharePageAccesses.filter(a => a.accessMethod === 'PASSWORD').length,
      GUEST: project.sharePageAccesses.filter(a => a.accessMethod === 'GUEST').length,
      NONE: project.sharePageAccesses.filter(a => a.accessMethod === 'NONE').length,
    }

    const totalDownloads = project.analytics.length

    // Combine authentication events and download events into single activity feed
    const authEvents = project.sharePageAccesses.map(access => ({
      id: access.id,
      type: 'AUTH' as const,
      accessMethod: access.accessMethod,
      email: access.email,
      createdAt: access.createdAt,
    }))

    const downloadEvents = videoAnalyticsRows.map(download => {
      let assetFileName: string | undefined
      let assetFileNames: string[] | undefined

      if (download.assetId) {
        // Single asset download
        const asset = download.video!.assets.find(a => a.id === download.assetId)
        assetFileName = asset?.fileName
      } else if (download.assetIds) {
        // Multiple asset download (ZIP)
        const assetIdArray = JSON.parse(download.assetIds) as string[]
        assetFileNames = assetIdArray
          .map(id => download.video!.assets.find(a => a.id === id)?.fileName)
          .filter((name): name is string => !!name)
      }

      return {
        id: download.id,
        type: 'DOWNLOAD' as const,
        videoName: download.video!.name,
        versionLabel: download.video!.versionLabel,
        assetId: download.assetId,
        assetIds: download.assetIds ? JSON.parse(download.assetIds) : undefined,
        assetFileName,
        assetFileNames,
        createdAt: download.createdAt,
      }
    })

    // Photo download events (albumId null = whole-project zip)
    const photosById = new Map(
      project.photoAlbums.flatMap(album => album.photos.map(photo => [photo.id, photo.fileName] as const))
    )
    const albumsById = new Map(project.photoAlbums.map(album => [album.id, album.name]))

    const photoDownloadEvents = photoAnalyticsRows.map(download => {
      const photoIds: string[] = download.photoIds ? JSON.parse(download.photoIds) : []
      return {
        id: download.id,
        type: 'PHOTO_DOWNLOAD' as const,
        albumName: download.albumId ? albumsById.get(download.albumId) ?? null : null,
        photoCount: photoIds.length,
        photoFileNames: photoIds
          .map(photoId => photosById.get(photoId))
          .filter((name): name is string => !!name),
        createdAt: download.createdAt,
      }
    })

    // Client uploads (reverse share) — the records themselves are the activity
    const clientUploadEvents = project.projectUploads.map(upload => ({
      id: upload.id,
      type: 'CLIENT_UPLOAD' as const,
      fileName: upload.fileName,
      uploaderName: upload.uploadedByName,
      uploaderEmail: upload.uploadedByEmail,
      createdAt: upload.createdAt,
    }))

    // Merge and sort all activity by timestamp (newest first)
    const allActivity = [...authEvents, ...downloadEvents, ...photoDownloadEvents, ...clientUploadEvents].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    const displayName = project.companyName || project.recipients[0]?.name || project.recipients[0]?.email || 'Client'

    return NextResponse.json({
      project: {
        id: project.id,
        title: project.title,
        recipientName: displayName,
        recipientEmail: project.companyName ? null : project.recipients[0]?.email || null,
        status: project.status,
      },
      stats: {
        totalVisits: project.sharePageAccesses.length,
        uniqueVisits: uniqueVisitors,
        accessByMethod,
        totalDownloads,
        videoCount: project.videos.length,
        photoCount: project.photoAlbums.reduce((sum, album) => sum + album.photos.length, 0),
        photoDownloads: photoAnalyticsRows.length,
        clientUploads: project.projectUploads.length,
      },
      videoStats,
      activity: allActivity,
    })
  } catch (error) {
    return NextResponse.json(
      { error: analyticsMessages.unableToProcessRequest || 'Unable to process request' },
      { status: 500 }
    )
  }
}
