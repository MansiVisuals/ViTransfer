'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { BarChart3, FolderKanban, Video, Eye, Download, RefreshCw, ChevronRight } from 'lucide-react'
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
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

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
  const filteredProjects = filterStatus
    ? projects.filter(p => p.status === filterStatus)
    : projects

  // Get unique statuses for filter
  const uniqueStatuses = Array.from(new Set(projects.map(p => p.status)))

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
                <div className="bg-primary-visible rounded-md p-1.5 flex-shrink-0">
                  <FolderKanban className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Projects</p>
                  <p className="text-base font-semibold tabular-nums truncate">{totalProjects.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-primary-visible rounded-md p-1.5 flex-shrink-0">
                  <Video className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Videos</p>
                  <p className="text-base font-semibold tabular-nums truncate">{totalVideos.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-primary-visible rounded-md p-1.5 flex-shrink-0">
                  <Eye className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Visits</p>
                  <p className="text-base font-semibold tabular-nums truncate">{totalVisits.toLocaleString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-primary-visible rounded-md p-1.5 flex-shrink-0">
                  <Download className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Downloads</p>
                  <p className="text-base font-semibold tabular-nums truncate">{totalDownloads.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters and Actions */}
        <Card className="mb-4">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex-1 min-w-[180px]">
                <label className="text-xs font-medium text-muted-foreground block">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full mt-1 h-9 px-3 bg-background text-foreground border border-border rounded-md"
                >
                  <option value="">All Statuses</option>
                  {uniqueStatuses.map(status => (
                    <option key={status} value={status}>
                      {status.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                {projects.length > 0 && (
                  <ViewModeToggle value={viewMode} onChange={setViewMode} />
                )}
                <Button onClick={loadAnalytics} variant="outline" size="sm" disabled={loading}>
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline ml-2">Refresh</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projects List */}
        {filteredProjects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
              <p className="text-muted-foreground">
                {projects.length === 0 ? 'No analytics data yet' : 'No projects match the selected filters'}
              </p>
              {projects.length === 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Analytics will appear once clients start viewing projects
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4'
                : 'space-y-3'
            }
          >
            {filteredProjects.map((project) => (
              <Link
                key={project.id}
                href={`/admin/analytics/${project.id}`}
                className="block group"
              >
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardHeader className="p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle
                            className={cn(
                              'transition-colors group-hover:text-primary',
                              viewMode === 'grid'
                                ? 'text-sm sm:text-base font-semibold break-words leading-snug'
                                : 'text-base sm:text-lg truncate'
                            )}
                          >
                            {project.title}
                          </CardTitle>
                          <ChevronRight
                            className={cn(
                              'w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0',
                              viewMode === 'grid' && 'hidden sm:block'
                            )}
                          />
                        </div>
                        <CardDescription
                          className={cn(
                            'mt-1',
                            viewMode === 'grid' ? 'text-xs sm:text-sm break-words' : 'truncate'
                          )}
                        >
                          {project.recipientEmail ? (
                            <>
                              {project.recipientName} • {project.recipientEmail}
                            </>
                          ) : (
                            project.recipientName
                          )}
                        </CardDescription>
                      </div>
                      <div className="flex-shrink-0">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                            project.status === 'APPROVED'
                              ? 'bg-success-visible text-success border border-success-visible'
                              : project.status === 'IN_REVIEW'
                              ? 'bg-warning-visible text-warning border border-warning-visible'
                              : project.status === 'SHARE_ONLY'
                              ? 'bg-primary-visible text-primary border border-primary-visible'
                              : 'bg-muted text-muted-foreground border border-border'
                          }`}
                        >
                          {project.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                    {viewMode === 'grid' ? (
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="bg-primary-visible rounded-md p-1.5 flex-shrink-0">
                              <Video className="w-4 h-4 text-primary" />
                            </div>
                            <span className="truncate">Videos</span>
                          </div>
                          <span className="text-foreground font-semibold tabular-nums">{project.videoCount}</span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="bg-primary-visible rounded-md p-1.5 flex-shrink-0">
                              <Eye className="w-4 h-4 text-primary" />
                            </div>
                            <span className="truncate">Visits</span>
                          </div>
                          <span className="text-foreground font-semibold tabular-nums">{project.totalVisits}</span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="bg-primary-visible rounded-md p-1.5 flex-shrink-0">
                              <Download className="w-4 h-4 text-primary" />
                            </div>
                            <span className="truncate">Downloads</span>
                          </div>
                          <span className="text-foreground font-semibold tabular-nums">{project.totalDownloads}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary-visible rounded-md p-1.5">
                            <Video className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Videos</p>
                            <p className="text-base font-semibold">{project.videoCount}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="bg-primary-visible rounded-md p-1.5">
                            <Eye className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Visits</p>
                            <p className="text-base font-semibold">{project.totalVisits}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 col-span-2 sm:col-span-1">
                          <div className="bg-primary-visible rounded-md p-1.5">
                            <Download className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Downloads</p>
                            <p className="text-base font-semibold">{project.totalDownloads}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
