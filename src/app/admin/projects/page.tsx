'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import Link from 'next/link'
import { FolderKanban, Plus, Video, Eye, Download } from 'lucide-react'
import ProjectsList from '@/components/ProjectsList'
import { apiFetch } from '@/lib/api-client'

interface AnalyticsOverview {
  totalProjects: number
  totalVideos: number
  totalVisits: number
  totalDownloads: number
}

export default function AdminPage() {
  const [projects, setProjects] = useState<any[] | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        // Fetch projects and analytics in parallel
        const [projectsRes, analyticsRes] = await Promise.all([
          apiFetch('/api/projects'),
          apiFetch('/api/analytics')
        ])

        if (projectsRes.ok) {
          const data = await projectsRes.json()
          setProjects(data.projects || data || [])
        } else {
          setProjects([])
        }

        if (analyticsRes.ok) {
          const analyticsData = await analyticsRes.json()
          const projectsList = analyticsData.projects || []
          setAnalytics({
            totalProjects: projectsList.length,
            totalVideos: projectsList.reduce((sum: number, p: any) => sum + (p.videoCount || 0), 0),
            totalVisits: projectsList.reduce((sum: number, p: any) => sum + (p.totalVisits || 0), 0),
            totalDownloads: projectsList.reduce((sum: number, p: any) => sum + (p.totalDownloads || 0), 0),
          })
        }
      } catch (error) {
        setProjects([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const metricIconWrapperClassName = 'rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10'
  const metricIconClassName = 'w-4 h-4 text-primary'

  if (loading) {
    return (
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading projects...</p>
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="flex-1 min-h-0 bg-background">
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
          <div className="flex justify-between items-center gap-4 mb-4 sm:mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
                <FolderKanban className="w-7 h-7 sm:w-8 sm:h-8" />
                Projects Dashboard
              </h1>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">Manage video projects and deliverables</p>
            </div>
            <Link href="/admin/projects/new">
              <Button variant="default" size="default">
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">New Project</span>
              </Button>
            </Link>
          </div>
          <div className="text-muted-foreground">No projects found.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <div className="flex justify-between items-center gap-4 mb-4 sm:mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <FolderKanban className="w-7 h-7 sm:w-8 sm:h-8" />
              Projects Dashboard
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">Manage video projects and deliverables</p>
          </div>
          <Link href="/admin/projects/new">
            <Button variant="default" size="default">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">New Project</span>
            </Button>
          </Link>
        </div>

        {/* Analytics Overview */}
        {analytics && (
          <Card className="p-3 mb-4">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <FolderKanban className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Projects</p>
                  <p className="text-base font-semibold tabular-nums">{analytics.totalProjects.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <Video className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Videos</p>
                  <p className="text-base font-semibold tabular-nums">{analytics.totalVideos.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <Eye className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Visits</p>
                  <p className="text-base font-semibold tabular-nums">{analytics.totalVisits.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className={metricIconWrapperClassName}>
                  <Download className={metricIconClassName} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Downloads</p>
                  <p className="text-base font-semibold tabular-nums">{analytics.totalDownloads.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </Card>
        )}

        <ProjectsList projects={projects} />
      </div>
    </div>
  )
}
