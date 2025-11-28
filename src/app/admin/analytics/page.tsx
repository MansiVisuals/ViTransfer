'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { BarChart3, Video, Eye, Download, RefreshCw, ChevronRight } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

interface ProjectAnalytics {
  id: string
  title: string
  recipientName: string
  recipientEmail: string | null
  status: string
  videoCount: number
  totalDownloads: number
  totalPageVisits: number
  updatedAt: Date
}

export default function AnalyticsDashboard() {
  const [projects, setProjects] = useState<ProjectAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('')

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

  // Calculate aggregate stats
  const totalProjects = projects.length
  const totalVisits = projects.reduce((sum, p) => sum + p.totalPageVisits, 0)
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="w-8 h-8" />
            Analytics Dashboard
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Track project views, downloads, and engagement metrics
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProjects.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Videos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalVideos.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Visits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalVisits.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Downloads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalDownloads.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filters & Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium mb-2 block">Project Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-background text-foreground border border-border rounded-md"
                >
                  <option value="">All Statuses</option>
                  {uniqueStatuses.map(status => (
                    <option key={status} value={status}>
                      {status.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-2">
                <Button onClick={loadAnalytics} variant="outline" disabled={loading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
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
          <div className="space-y-4">
            {filteredProjects.map((project) => (
              <Link
                key={project.id}
                href={`/admin/analytics/${project.id}`}
                className="block group"
              >
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg sm:text-xl truncate group-hover:text-primary transition-colors">
                            {project.title}
                          </CardTitle>
                          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <CardDescription className="truncate mt-1">
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
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-visible rounded-md">
                          <Video className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Videos</p>
                          <p className="text-lg font-bold">{project.videoCount}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-visible rounded-md">
                          <Eye className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Visits</p>
                          <p className="text-lg font-bold">{project.totalPageVisits}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-visible rounded-md">
                          <Download className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Downloads</p>
                          <p className="text-lg font-bold">{project.totalDownloads}</p>
                        </div>
                      </div>
                    </div>
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
