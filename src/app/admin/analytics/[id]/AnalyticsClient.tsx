'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { BarChart3, Video, Eye, Download, Calendar, Clock, ArrowLeft, Mail, Lock, UserCircle, Users, Globe } from 'lucide-react'
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

interface RecentAccess {
  id: string
  accessMethod: 'OTP' | 'PASSWORD' | 'GUEST' | 'NONE'
  email: string | null
  createdAt: Date
}

interface AnalyticsData {
  project: {
    id: string
    title: string
    recipientName: string
    recipientEmail: string | null
    status: string
  }
  stats: {
    totalAccesses: number
    uniqueAccesses: number
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
  recentAccesses: RecentAccess[]
}

function getAccessMethodColor(method: string): string {
  const map: Record<string, string> = {
    'OTP': 'bg-primary-visible text-primary border-2 border-primary-visible',
    'PASSWORD': 'bg-warning-visible text-warning border-2 border-warning-visible',
    'GUEST': 'bg-muted text-muted-foreground border-2 border-border',
    'NONE': 'bg-success-visible text-success border-2 border-success-visible',
  }
  return map[method] || 'bg-muted text-muted-foreground border border-border'
}

export default function AnalyticsClient({ id }: { id: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Project not found</p>
          <Link href="/admin/analytics">
            <Button>Back to Analytics</Button>
          </Link>
        </div>
      </div>
    )
  }

  const { project, stats, videoStats, recentAccesses } = data

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
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
              <CardTitle className="text-sm font-medium">Total Accesses</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalAccesses.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.uniqueAccesses} unique sessions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.uniqueAccesses.toLocaleString()}</div>
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

        <div className="mb-6 sm:mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Access Methods</CardTitle>
              <CardDescription>How clients authenticated to view this project</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-visible rounded-md">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email OTP</p>
                    <p className="text-lg font-bold">{stats.accessByMethod.OTP}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-warning-visible rounded-md">
                    <Lock className="w-4 h-4 text-warning" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Password</p>
                    <p className="text-lg font-bold">{stats.accessByMethod.PASSWORD}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-md">
                    <UserCircle className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Guest</p>
                    <p className="text-lg font-bold">{stats.accessByMethod.GUEST}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-success-visible rounded-md">
                    <Globe className="w-4 h-4 text-success" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Public</p>
                    <p className="text-lg font-bold">{stats.accessByMethod.NONE}</p>
                  </div>
                </div>
              </div>
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
              <CardTitle>Recent Access Activity</CardTitle>
              <CardDescription>Last 20 authentication events</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-hidden">
              {recentAccesses.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No access events yet</p>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {recentAccesses.map((access) => (
                    <div key={access.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg border text-sm">
                      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${getAccessMethodColor(access.accessMethod)}`}>
                          {access.accessMethod}
                        </span>
                        {access.email && (
                          <div className="truncate min-w-0">
                            <span className="text-muted-foreground">{access.email}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-left sm:text-right flex-shrink-0">
                        <div className="text-xs text-muted-foreground flex items-center gap-1 sm:justify-end">
                          <Calendar className="w-3 h-3" />
                          <span className="whitespace-nowrap">{formatDateTime(access.createdAt)}</span>
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
