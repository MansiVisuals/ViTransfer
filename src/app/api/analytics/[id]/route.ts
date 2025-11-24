import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

// GET /api/analytics/[id] - Get detailed analytics for a specific project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting: 100 requests per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 100,
    message: 'Too many requests. Please slow down.'
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
        analytics: {
          orderBy: { createdAt: 'desc' },
          include: {
            video: {
              select: {
                id: true,
                name: true,
                versionLabel: true,
                originalFileName: true,
              },
            },
          },
        },
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

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
      const videoAnalytics = project.analytics.filter(a => videoIds.includes(a.videoId))
      const totalDownloads = videoAnalytics.filter(a => a.eventType === 'DOWNLOAD_COMPLETE').length
      const totalPageVisits = videoAnalytics.filter(a => a.eventType === 'PAGE_VISIT').length
      const lastAccessed = videoAnalytics[0]?.createdAt || null

      // Per-version breakdown
      const versionStats = versions.map(version => {
        const versionAnalytics = project.analytics.filter(a => a.videoId === version.id)
        const downloads = versionAnalytics.filter(a => a.eventType === 'DOWNLOAD_COMPLETE').length
        return {
          id: version.id,
          versionLabel: version.versionLabel,
          downloads,
        }
      })

      return {
        videoName,
        totalDownloads,
        totalPageVisits,
        lastAccessed,
        versions: versionStats,
      }
    })

    const totalPageVisits = project.analytics.filter(a => a.eventType === 'PAGE_VISIT').length
    const totalDownloads = project.analytics.filter(a => a.eventType === 'DOWNLOAD_COMPLETE').length

    const recentActivity = project.analytics.slice(0, 20).map(event => ({
      id: event.id,
      eventType: event.eventType,
      videoName: event.video?.name || 'Unknown',
      videoLabel: event.video?.versionLabel || 'Unknown',
      createdAt: event.createdAt,
    }))

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
        totalPageVisits,
        totalDownloads,
        videoCount: project.videos.length,
      },
      videoStats,
      recentActivity,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Unable to process request' },
      { status: 500 }
    )
  }
}
