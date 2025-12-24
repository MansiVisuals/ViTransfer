'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { BarChart3, FolderKanban, Video, Eye, Download, RefreshCw, ArrowUpDown } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import ViewModeToggle, { type ViewMode } from '@/components/ViewModeToggle'
import { cn } from '@/lib/utils'

interface ProjectAnalytics {
  id: string
  title: string
  recipientName: string
  recipientEmail: string | null
  status: string
  videoCount: number
  totalVisits: number
  uniqueVisits: number
  accessByMethod: {
    OTP: number
    PASSWORD: number
    GUEST: number
    NONE: number
  }
  totalDownloads: number
  updatedAt: Date
}

export default function AnalyticsDashboard() {
  const [projects, setProjects] = useState<ProjectAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortMode, setSortMode] = useState<'status' | 'alphabetical'>('alphabetical')
  const metricIconWrapperClassName = 'rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10'
  const metricIconClassName = 'w-4 h-4 text-primary'

  const loadAnalytics = async () => {
    setLoading(true)
    try {
      const response = await apiFetch('/api/analytics')
      if (!response.ok) throw new Error('Failed to load analytics')
      const data = await response.json()
      setProjects(data.projects || [])
    } catch (error) {
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAnalytics()
  }, [])

  useEffect(() => {
    const storageKey = 'admin_analytics_view'
    const stored = localStorage.getItem(storageKey)

    if (stored === 'grid' || stored === 'list') {
      setViewMode(stored)
      return
    }

    setViewMode('grid')
  }, [])

  useEffect(() => {
    localStorage.setItem('admin_analytics_view', viewMode)
  }, [viewMode])

  // Calculate aggregate stats
  const totalProjects = projects.length
  const totalVisits = projects.reduce((sum, p) => sum + p.totalVisits, 0)
  const totalDownloads = projects.reduce((sum, p) => sum + p.totalDownloads, 0)
  const totalVideos = projects.reduce((sum, p) => sum + p.videoCount, 0)

  // Filter projects
  const sortedProjects = [...projects].sort((a, b) => {
    if (sortMode === 'alphabetical') {
      return a.title.localeCompare(b.title)
    }

    const statusPriority = { IN_REVIEW: 1, SHARE_ONLY: 2, APPROVED: 3 } as const
    const priorityDiff = (statusPriority[a.status as keyof typeof statusPriority] ?? 99) - (statusPriority[b.status as keyof typeof statusPriority] ?? 99)
    if (priorityDiff !== 0) return priorityDiff
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  if (loading) {
    return (
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <div className="mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="w-8 h-8" />
            Analytics Dashboard
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Track share page accesses, downloads, and engagement metrics
          </p>
        </div>

        {/* Stats Overview */}
        <Card className="mb-4">
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardTitle className="text-sm font-medium">Overview</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <FolderKanban className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Projects</p>
                  <p className="text-base font-semibold tabular-nums truncate">{totalProjects.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <Video className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Videos</p>
                  <p className="text-base font-semibold tabular-nums truncate">{totalVideos.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <Eye className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Visits</p>
                  <p className="text-base font-semibold tabular-nums truncate">{totalVisits.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <Download className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Downloads</p>
                  <p className="text-base font-semibold tabular-nums truncate">{totalDownloads.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projects List */}
        {sortedProjects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
              <p className="text-muted-foreground">
                No analytics data yet
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Analytics will appear once clients start viewing projects
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSortMode(current => current === 'status' ? 'alphabetical' : 'status')}
                className="text-muted-foreground hover:text-foreground"
                title={sortMode === 'status' ? 'Sort alphabetically' : 'Sort by status'}
              >
                <ArrowUpDown className="w-4 h-4" />
              </Button>
              <Button
                onClick={loadAnalytics}
                variant="ghost"
                size="sm"
                disabled={loading}
                className="text-muted-foreground hover:text-foreground"
                title="Refresh"
              >
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              </Button>
            </div>

            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4'
                  : 'space-y-3'
              }
            >
              {sortedProjects.map((project) => (
              <Link
                key={project.id}
                href={`/admin/analytics/${project.id}`}
                className="block group"
              >
                <Card className="cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-elevation-lg sm:hover:-translate-y-1">
                  <CardHeader className={cn('p-3 sm:p-4', viewMode === 'grid' && 'p-2 sm:p-3')}>
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <CardTitle
                          className={cn(
                            'font-semibold transition-colors group-hover:text-primary',
                            viewMode === 'grid' ? 'text-sm sm:text-base break-words' : 'text-base sm:text-lg'
                          )}
                        >
                          {project.title}
                        </CardTitle>
                        <CardDescription className={cn('mt-1 break-words', viewMode === 'grid' ? 'text-xs sm:text-sm' : 'text-sm')}>
                          {project.recipientEmail ? (
                            <>
                              Client: {project.recipientName}
                              <span className="hidden sm:inline"> ({project.recipientEmail})</span>
                              <span className="block sm:hidden text-xs mt-1">{project.recipientEmail}</span>
                            </>
                          ) : (
                            `Client: ${project.recipientName}`
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className={cn('p-3 pt-0 sm:p-4 sm:pt-0', viewMode === 'grid' && 'p-2 pt-0 sm:p-3 sm:pt-0')}>
                    <div className={cn('flex flex-wrap gap-3 sm:gap-6 text-muted-foreground', viewMode === 'grid' ? 'text-xs sm:text-sm' : 'text-sm')}>
                      <div className="inline-flex items-center gap-2">
                        <span className={metricIconWrapperClassName}>
                          <Video className={metricIconClassName} />
                        </span>
                        <span className="font-medium tabular-nums">{project.videoCount}</span>
                        <span>
                          video
                          {project.videoCount !== 1 ? 's' : ''}
                        </span>
                      </div>

                      <div className="inline-flex items-center gap-2">
                        <span className={metricIconWrapperClassName}>
                          <Eye className={metricIconClassName} />
                        </span>
                        <span className="font-medium tabular-nums">{project.totalVisits}</span>
                        <span>visits</span>
                      </div>

                      <div className="inline-flex items-center gap-2">
                        <span className={metricIconWrapperClassName}>
                          <Download className={metricIconClassName} />
                        </span>
                        <span className="font-medium tabular-nums">{project.totalDownloads}</span>
                        <span>downloads</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
