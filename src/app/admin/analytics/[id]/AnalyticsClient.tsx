'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { BarChart3, Video, Eye, Download, Calendar, Clock, ArrowLeft, Mail, Lock, UserCircle, Users, Globe, ChevronDown, ChevronRight } from 'lucide-react'
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

function getAccessMethodColor(method: string): string {
  // All auth/visit events use primary (blue) color for easy visual distinction from downloads
  return 'bg-primary-visible text-primary border-2 border-primary-visible'
}

export default function AnalyticsClient({ id }: { id: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

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
          <Link href="/admin/analytics">
            <Button>Back to Analytics</Button>
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
            <Link href="/admin/analytics">
              <Button variant="ghost" size="default" className="justify-start px-3 mb-2">
                <ArrowLeft className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Back to Analytics</span>
                <span className="sm:hidden">Back</span>
              </Button>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-bold">{project.title}</h1>
            {project.recipientName && (
              <p className="text-muted-foreground mt-1">Client: {project.recipientName}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6 sm:mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Visits</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalVisits.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.uniqueVisits} unique sessions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.uniqueVisits.toLocaleString()}</div>
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

        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2 overflow-hidden">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Videos in this Project</CardTitle>
              <CardDescription>Analytics grouped by video name, showing all versions</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-hidden">
              {videoStats.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No videos available</p>
              ) : (
                <div className="space-y-4">
                  {videoStats.map((video) => (
                    <div key={video.videoName} className="border rounded-lg p-3 sm:p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm sm:text-base break-words">{video.videoName}</h4>
                          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                            {video.versions.length} version{video.versions.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>

                      <div className="mb-3">
                        <div className="text-sm">
                          <div className="text-xs text-muted-foreground mb-1">Total Downloads</div>
                          <div className="font-medium text-base sm:text-lg">{video.totalDownloads}</div>
                        </div>
                      </div>

                      {video.versions.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="text-xs text-muted-foreground mb-2">Per-version breakdown:</div>
                          <div className="space-y-1.5">
                            {video.versions.map((version) => (
                              <div key={version.id} className="flex items-center justify-between gap-2 text-xs sm:text-sm bg-accent/50 rounded px-2 py-1.5">
                                <span className="text-muted-foreground truncate">{version.versionLabel}</span>
                                <span className="font-medium whitespace-nowrap flex-shrink-0">{version.downloads} download{version.downloads !== 1 ? 's' : ''}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Project Activity</CardTitle>
              <CardDescription>All authentication and download events</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-hidden">
              {activity.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No activity yet</p>
              ) : (
                <div className="space-y-2">
                  {activity.map((event) => {
                    const isExpanded = expandedItems.has(event.id)
                    return (
                      <div
                        key={event.id}
                        className="rounded-lg border text-sm hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(event.id)}
                      >
                        <div className="flex items-center gap-3 p-3">
                          {/* Badge - left aligned */}
                          <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${event.type === 'AUTH' ? getAccessMethodColor(event.accessMethod) : 'bg-success-visible text-success border-2 border-success-visible'}`}>
                            {event.type === 'AUTH' ? (
                              event.accessMethod === 'OTP' ? 'Email OTP' :
                              event.accessMethod === 'PASSWORD' ? 'Password' :
                              event.accessMethod === 'GUEST' ? 'Guest Access' :
                              'Public Access'
                            ) : (
                              <>
                                <Download className="w-3 h-3 inline mr-1" />
                                {event.assetIds ? 'ZIP' : event.assetId ? 'Asset' : 'Video'}
                              </>
                            )}
                          </span>

                          {/* Text - centered, grows to fill space */}
                          <div className="flex-1 min-w-0 flex items-center justify-center">
                            <span className="text-muted-foreground text-sm truncate">
                              {event.type === 'AUTH' ? (
                                event.email ? (
                                  isExpanded ? event.email : `${event.email.substring(0, 20)}${event.email.length > 20 ? '...' : ''}`
                                ) : (
                                  event.accessMethod === 'GUEST' ? 'Guest visitor' : 'Public visitor'
                                )
                              ) : (
                                isExpanded ? event.videoName : `${event.videoName.substring(0, 25)}${event.videoName.length > 25 ? '...' : ''}`
                              )}
                            </span>
                          </div>

                          {/* Date/Time - before chevron */}
                          <div className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                            {formatDateTime(event.createdAt)}
                          </div>

                          {/* Chevron - right aligned */}
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          )}
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-3 border-t bg-muted/30">
                            {event.type === 'AUTH' ? (
                              <div className="space-y-2">
                                <div className="flex items-start gap-2">
                                  <span className="text-xs font-semibold text-foreground min-w-[80px]">Action</span>
                                  <span className="text-sm text-muted-foreground">Accessed the project</span>
                                </div>
                                {event.email && (
                                  <div className="flex items-start gap-2">
                                    <span className="text-xs font-semibold text-foreground min-w-[80px]">Email</span>
                                    <span className="text-sm text-muted-foreground break-all">{event.email}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="flex items-start gap-2">
                                  <span className="text-xs font-semibold text-foreground min-w-[80px]">Video</span>
                                  <span className="text-sm text-muted-foreground">{event.videoName} ({event.versionLabel})</span>
                                </div>

                                <div className="flex items-start gap-2">
                                  <span className="text-xs font-semibold text-foreground min-w-[80px]">Content</span>
                                  <div className="flex-1">
                                    {event.assetFileNames && event.assetFileNames.length > 0 ? (
                                      <div>
                                        <p className="text-sm text-muted-foreground mb-2">
                                          ZIP archive with {event.assetFileNames.length} asset{event.assetFileNames.length !== 1 ? 's' : ''}
                                        </p>
                                        <div className="space-y-1 pl-3 border-l-2 border-border">
                                          {event.assetFileNames.map((fileName, idx) => (
                                            <div key={idx} className="text-sm text-muted-foreground break-all font-mono text-xs">
                                              {fileName}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : event.assetFileName ? (
                                      <div className="text-sm text-muted-foreground">
                                        <p className="mb-1">Single asset file</p>
                                        <p className="font-mono text-xs break-all pl-3 border-l-2 border-border">{event.assetFileName}</p>
                                      </div>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">Full video file</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
