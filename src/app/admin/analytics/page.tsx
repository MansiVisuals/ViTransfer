'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { BarChart3, Video, Eye } from 'lucide-react'
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

  useEffect(() => {
    const loadAnalytics = async () => {
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
    loadAnalytics()
  }, [])

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
            <BarChart3 className="w-7 h-7 sm:w-8 sm:h-8" />
            Analytics Dashboard
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Track project views and downloads
          </p>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
              <p className="text-muted-foreground">No analytics data yet</p>
              <p className="text-sm text-muted-foreground mt-2">
                Analytics will appear once clients start viewing projects
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/admin/analytics/${project.id}`}
                className="block"
              >
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg sm:text-xl truncate">
                          {project.title}
                        </CardTitle>
                        <CardDescription className="truncate">
                          {project.recipientEmail ? (
                            <>
                              {project.recipientName} ({project.recipientEmail})
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
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                          <Video className="w-4 h-4" />
                          <span className="text-xs">Videos</span>
                        </div>
                        <p className="text-xl sm:text-2xl font-bold">
                          {project.videoCount}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                          <Eye className="w-4 h-4" />
                          <span className="text-xs">Visits</span>
                        </div>
                        <p className="text-xl sm:text-2xl font-bold">
                          {project.totalPageVisits}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                          <BarChart3 className="w-4 h-4" />
                          <span className="text-xs">Downloads</span>
                        </div>
                        <p className="text-xl sm:text-2xl font-bold">
                          {project.totalDownloads}
                        </p>
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
