import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { BarChart3, Video, Eye, Download, Calendar, Clock, ArrowLeft } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

async function getProjectAnalytics(id: string) {
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

  if (!project) return null

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

  return {
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
  }
}

function formatEventType(eventType: string): string {
  const map: Record<string, string> = {
    'PAGE_VISIT': 'Project Visit',
    'DOWNLOAD_COMPLETE': 'Download',
  }
  return map[eventType] || eventType
}

function getEventColor(eventType: string): string {
  const map: Record<string, string> = {
    'PAGE_VISIT': 'bg-primary-visible text-primary border-2 border-primary-visible',
    'DOWNLOAD_COMPLETE': 'bg-success-visible text-success border-2 border-success-visible',
  }
  return map[eventType] || 'bg-muted text-muted-foreground border border-border'
}

export default async function ProjectAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getProjectAnalytics(id)

  if (!data) {
    notFound()
  }

  const { project, stats, videoStats, recentActivity } = data

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Link href="/admin/analytics">
              <Button variant="ghost" size="default" className="mb-2">
                <ArrowLeft className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Back to Analytics</span>
              </Button>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold">{project.title}</h1>
            {project.recipientName && (
              <p className="text-muted-foreground mt-1">Client: {project.recipientName}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:gap-6 md:grid-cols-3 mb-6 sm:mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Project Visits</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPageVisits.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Downloads</CardTitle>
              <Download className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDownloads.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Videos</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.videoCount}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Videos in this Project</CardTitle>
              <CardDescription>Analytics grouped by video name, showing all versions</CardDescription>
            </CardHeader>
            <CardContent>
              {videoStats.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No videos available</p>
              ) : (
                <div className="space-y-4">
                  {videoStats.map((video) => (
                    <div key={video.videoName} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-base">{video.videoName}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {video.versions.length} version{video.versions.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="text-sm">
                          <div className="text-xs text-muted-foreground mb-1">Total Downloads</div>
                          <div className="font-medium text-lg">{video.totalDownloads}</div>
                        </div>
                        <div className="text-sm">
                          <div className="text-xs text-muted-foreground mb-1">Total Views</div>
                          <div className="font-medium text-lg">{video.totalPageVisits}</div>
                        </div>
                      </div>

                      {video.versions.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="text-xs text-muted-foreground mb-2">Per-version breakdown:</div>
                          <div className="space-y-1.5">
                            {video.versions.map((version) => (
                              <div key={version.id} className="flex items-center justify-between text-sm bg-accent/50 rounded px-2 py-1.5">
                                <span className="text-muted-foreground">{version.versionLabel}</span>
                                <span className="font-medium">{version.downloads} download{version.downloads !== 1 ? 's' : ''}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {video.lastAccessed && (
                        <div className="mt-3 pt-3 border-t text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Last accessed: {formatDateTime(video.lastAccessed)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Last 20 events</CardDescription>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No activity yet</p>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {recentActivity.map((event) => (
                    <div key={event.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getEventColor(event.eventType)}`}>
                          {formatEventType(event.eventType)}
                        </span>
                        <div className="truncate">
                          <span className="font-medium">{event.videoName}</span>
                          <span className="text-muted-foreground ml-1.5">({event.videoLabel})</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                          <Calendar className="w-3 h-3" />
                          {formatDateTime(event.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
