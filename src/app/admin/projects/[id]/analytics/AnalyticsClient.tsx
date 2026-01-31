'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { BarChart3, Video, Eye, Download, ArrowLeft, Mail, Lock, UserCircle, Users, Globe, ChevronDown, ChevronRight } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { apiFetch } from '@/lib/api-client'

interface VideoStats {
  videoName: string
  totalDownloads: number
  versions: Array<{
    id: string
    versionLabel: string
    downloads: number
  }>
}

interface AuthActivity {
  id: string
  type: 'AUTH'
  accessMethod: 'OTP' | 'PASSWORD' | 'GUEST' | 'NONE'
  email: string | null
  createdAt: Date
}

interface DownloadActivity {
  id: string
  type: 'DOWNLOAD'
  videoName: string
  versionLabel: string
  assetId?: string | null
  assetIds?: string[]
  assetFileName?: string
  assetFileNames?: string[]
  createdAt: Date
}

type Activity = AuthActivity | DownloadActivity

interface AnalyticsData {
  project: {
    id: string
    title: string
    recipientName: string
    recipientEmail: string | null
    status: string
  }
  stats: {
    totalVisits: number
    uniqueVisits: number
    accessByMethod: {
      OTP: number
      PASSWORD: number
      GUEST: number
      NONE: number
    }
    totalDownloads: number
    videoCount: number
  }
  videoStats: VideoStats[]
  activity: Activity[]
}

// Calculate page size to fill available height without scrolling
function calculatePageSize(rowHeight: number, headerOffset: number): number {
  if (typeof window === 'undefined') return 15
  const available = window.innerHeight - headerOffset
  return Math.max(5, Math.floor(available / rowHeight))
}

function useResponsivePageSize(rowHeight: number, headerOffset: number): number {
  // Calculate initial value synchronously to prevent flickering on mount
  const [pageSize, setPageSize] = useState(() => calculatePageSize(rowHeight, headerOffset))

  useEffect(() => {
    // Only listen for resize events, don't recalculate on mount
    const handleResize = () => setPageSize(calculatePageSize(rowHeight, headerOffset))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [rowHeight, headerOffset])

  return pageSize
}

export default function AnalyticsClient({ id }: { id: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [expandedVideos, setExpandedVideos] = useState<Set<string>>(new Set())
  const [activityPage, setActivityPage] = useState(1)
  // Row ~36px, header/stats/nav ~380px offset
  const activityPerPage = useResponsivePageSize(36, 380)

  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  const toggleVideoExpand = (videoName: string) => {
    setExpandedVideos(prev => {
      const next = new Set(prev)
      if (next.has(videoName)) {
        next.delete(videoName)
      } else {
        next.add(videoName)
      }
      return next
    })
  }

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const response = await apiFetch(`/api/analytics/${id}`)
        if (!response.ok) {
          if (response.status === 404) {
            setError(true)
          }
          throw new Error('Failed to load analytics')
        }
        const analyticsData = await response.json()
        setData(analyticsData)
      } catch (error) {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    loadAnalytics()
  }, [id])

  if (loading) {
    return (
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Project not found</p>
          <Link href="/admin/projects">
            <Button>Back to Projects</Button>
          </Link>
        </div>
      </div>
    )
  }

  const { project, stats, videoStats, activity } = data

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Link href={`/admin/projects/${id}`}>
              <Button variant="ghost" size="default" className="justify-start px-3 mb-2">
                <ArrowLeft className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Back to Project</span>
                <span className="sm:hidden">Back</span>
              </Button>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <BarChart3 className="w-7 h-7 sm:w-8 sm:h-8" />
              {project.title}
            </h1>
            {project.recipientName && (
              <p className="text-muted-foreground mt-1">Client: {project.recipientName}</p>
            )}
          </div>
        </div>

        {/* Compact Stats Bar */}
        <Card className="p-3 mb-4">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2">
              <div className="rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10">
                <Eye className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Visits</p>
                <p className="text-base font-semibold tabular-nums">{stats.totalVisits.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Unique</p>
                <p className="text-base font-semibold tabular-nums">{stats.uniqueVisits.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10">
                <Download className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Downloads</p>
                <p className="text-base font-semibold tabular-nums">{stats.totalDownloads.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10">
                <Video className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Videos</p>
                <p className="text-base font-semibold tabular-nums">{stats.videoCount}</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2 overflow-hidden">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
              <span className="text-sm font-medium">Videos in this Project</span>
              <span className="text-xs text-muted-foreground">{videoStats.length} videos</span>
            </div>
            <div className="overflow-x-hidden">
              {videoStats.length === 0 ? (
                <p className="text-center text-muted-foreground py-4 text-sm">No videos available</p>
              ) : (
                <div className="divide-y">
                  {/* Table Header */}
                  <div className="flex items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground bg-muted/20">
                    <span className="w-4 flex-shrink-0"></span>
                    <span className="flex-1 min-w-0">Name</span>
                    <span className="w-16 text-right">Versions</span>
                    <span className="w-20 text-right">Downloads</span>
                    <span className="w-4 flex-shrink-0"></span>
                  </div>
                  {videoStats.map((video) => {
                    const isExpanded = expandedVideos.has(video.videoName)
                    return (
                      <div
                        key={video.videoName}
                        className="text-sm hover:bg-accent/30 transition-colors cursor-pointer"
                        onClick={() => toggleVideoExpand(video.videoName)}
                      >
                        <div className="flex items-center gap-3 px-3 py-2">
                          <Video className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className="flex-1 min-w-0 truncate font-medium">{video.videoName}</span>
                          <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
                            {video.versions.length}
                          </span>
                          <span className="w-20 text-right text-xs font-medium tabular-nums">
                            {video.totalDownloads}
                          </span>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          )}
                        </div>
                        {isExpanded && video.versions.length > 0 && (
                          <div className="px-3 pb-2 bg-muted/20">
                            <div className="pl-7 space-y-0.5">
                              {video.versions.map((version) => (
                                <div key={version.id} className="flex items-center justify-between gap-2 text-xs py-0.5">
                                  <span className="text-muted-foreground truncate">{version.versionLabel}</span>
                                  <span className="font-medium tabular-nums">{version.downloads} downloads</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
              <span className="text-sm font-medium">Project Activity</span>
              <span className="text-xs text-muted-foreground">{activity.length} events</span>
            </div>
            {/* Table Header */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-muted/20 border-b">
              <span className="w-24 flex-shrink-0">Type</span>
              <span className="flex-1 min-w-0">Details</span>
              <span className="w-32 hidden md:block">Date</span>
              <span className="w-4"></span>
            </div>
            <div className="overflow-x-hidden">
              {activity.length === 0 ? (
                <p className="text-center text-muted-foreground py-4 text-sm">No activity yet</p>
              ) : (
                <div className="divide-y">
                  {activity.slice((activityPage - 1) * activityPerPage, activityPage * activityPerPage).map((event) => {
                    const isExpanded = expandedItems.has(event.id)
                    const ActivityIcon = event.type === 'AUTH'
                      ? (event.accessMethod === 'OTP' ? Mail : event.accessMethod === 'PASSWORD' ? Lock : event.accessMethod === 'GUEST' ? UserCircle : Globe)
                      : Download
                    const iconColor = event.type === 'AUTH' ? 'text-primary' : 'text-success'

                    return (
                      <div
                        key={event.id}
                        className="text-sm hover:bg-accent/30 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(event.id)}
                      >
                        {/* Table Row */}
                        <div className="flex items-center gap-2 px-3 py-2">
                          {/* Type */}
                          <div className="w-24 flex-shrink-0 flex items-center gap-1.5">
                            <ActivityIcon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
                            <span className="text-xs font-medium hidden sm:inline">
                              {event.type === 'AUTH' ? (
                                event.accessMethod === 'OTP' ? 'OTP' :
                                event.accessMethod === 'PASSWORD' ? 'Password' :
                                event.accessMethod === 'GUEST' ? 'Guest' : 'Public'
                              ) : (
                                event.assetIds ? 'ZIP' : event.assetId ? 'Asset' : 'Download'
                              )}
                            </span>
                          </div>
                          {/* Details */}
                          <span className="flex-1 min-w-0 text-muted-foreground truncate">
                            {event.type === 'AUTH' ? (
                              event.email || (event.accessMethod === 'GUEST' ? 'Guest visitor' : 'Public visitor')
                            ) : (
                              event.videoName
                            )}
                          </span>
                          {/* Date */}
                          <span className="w-32 text-xs text-muted-foreground whitespace-nowrap hidden md:block">
                            {formatDateTime(event.createdAt)}
                          </span>
                          {/* Chevron */}
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          )}
                        </div>

                        {isExpanded && (
                          <div className="px-3 pb-2 bg-muted/20">
                            <div className="pl-6 text-xs space-y-1">
                              {/* Date - shown on mobile only */}
                              <div className="flex gap-2 md:hidden">
                                <span className="text-muted-foreground">Date:</span>
                                <span>{formatDateTime(event.createdAt)}</span>
                              </div>
                              {event.type === 'AUTH' ? (
                                <>
                                  <div className="flex gap-2">
                                    <span className="text-muted-foreground">Action:</span>
                                    <span>Accessed the project</span>
                                  </div>
                                  {event.email && (
                                    <div className="flex gap-2">
                                      <span className="text-muted-foreground">Email:</span>
                                      <span className="break-all">{event.email}</span>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div className="flex gap-2">
                                    <span className="text-muted-foreground">Video:</span>
                                    <span>{event.videoName}</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <span className="text-muted-foreground">Version:</span>
                                    <span>{event.versionLabel}</span>
                                  </div>
                                  <div className="flex gap-2">
                                    <span className="text-muted-foreground">Content:</span>
                                    <span>
                                      {event.assetFileNames && event.assetFileNames.length > 0
                                        ? `ZIP (${event.assetFileNames.length} assets)`
                                        : event.assetFileName
                                        ? event.assetFileName
                                        : 'Full video file'}
                                    </span>
                                  </div>
                                  {event.assetFileNames && event.assetFileNames.length > 0 && (
                                    <div className="pl-3 mt-1 border-l-2 border-border space-y-0.5">
                                      {event.assetFileNames.map((fileName, idx) => (
                                        <div key={idx} className="text-muted-foreground font-mono break-all">
                                          {fileName}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Pagination Controls */}
              {activity.length > activityPerPage && (
                <div className="flex items-center justify-between px-3 py-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setActivityPage(p => Math.max(1, p - 1)) }}
                    disabled={activityPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {activityPage} of {Math.ceil(activity.length / activityPerPage)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setActivityPage(p => Math.min(Math.ceil(activity.length / activityPerPage), p + 1)) }}
                    disabled={activityPage >= Math.ceil(activity.length / activityPerPage)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
