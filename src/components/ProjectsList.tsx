'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, ArrowUpDown } from 'lucide-react'
import ViewModeToggle, { type ViewMode } from '@/components/ViewModeToggle'
import { cn, formatDate } from '@/lib/utils'

interface Project {
  id: string
  title: string
  companyName: string | null
  status: string
  updatedAt: Date
  maxRevisions: number
  enableRevisions: boolean
  videos: any[]
  recipients: any[]
  _count: { comments: number }
}

interface ProjectsListProps {
  projects: Project[]
}

export default function ProjectsList({ projects }: ProjectsListProps) {
  const [sortMode, setSortMode] = useState<'status' | 'alphabetical'>('alphabetical')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  useEffect(() => {
    const storageKey = 'admin_projects_view'
    const stored = localStorage.getItem(storageKey)

    if (stored === 'grid' || stored === 'list') {
      setViewMode(stored)
      return
    }

    setViewMode('grid')
  }, [])

  useEffect(() => {
    localStorage.setItem('admin_projects_view', viewMode)
  }, [viewMode])

  const sortedProjects = [...projects].sort((a, b) => {
    if (sortMode === 'alphabetical') {
      return a.title.localeCompare(b.title)
    } else {
      // Status sorting
      const statusPriority = { IN_REVIEW: 1, SHARE_ONLY: 2, APPROVED: 3 }
      const priorityDiff = statusPriority[a.status as keyof typeof statusPriority] - statusPriority[b.status as keyof typeof statusPriority]
      if (priorityDiff !== 0) return priorityDiff
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }
  })

  return (
    <>
      {projects.length > 0 && (
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
        </div>
      )}

      <div
        className={cn(
          'grid gap-3 sm:gap-4',
          viewMode === 'grid' && 'sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
        )}
      >
        {projects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No projects yet</p>
              <Link href="/admin/projects/new">
                <Button variant="default" size="default">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Project
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          sortedProjects.map((project) => {
            const readyVideos = project.videos.filter((v) => v.status === 'READY').length
            const totalVideos = project.videos.length

            return (
              <Link key={project.id} href={`/admin/projects/${project.id}`}>
                <Card className="cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-elevation-lg sm:hover:-translate-y-1">
                  <CardHeader className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base sm:text-lg">{project.title}</CardTitle>
                        <CardDescription className="mt-1 text-sm break-words">
                          {(() => {
                            const primaryRecipient = project.recipients?.find(r => r.isPrimary) || project.recipients?.[0]
                            const displayName = project.companyName || primaryRecipient?.name || primaryRecipient?.email || 'Client'

                            return (
                              <>
                                Client: {displayName}
                                {!project.companyName && primaryRecipient?.name && primaryRecipient?.email && (
                                  <>
                                    <span className="hidden sm:inline"> ({primaryRecipient.email})</span>
                                    <span className="block sm:hidden text-xs mt-1">{primaryRecipient.email}</span>
                                  </>
                                )}
                              </>
                            )
                          })()}
                        </CardDescription>
                      </div>
                      <div className="flex flex-row sm:flex-col items-start sm:items-end gap-2 w-full sm:w-auto">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                            project.status === 'APPROVED'
                              ? 'bg-success-visible text-success border-2 border-success-visible'
                              : project.status === 'SHARE_ONLY'
                              ? 'bg-info-visible text-info border-2 border-info-visible'
                              : project.status === 'IN_REVIEW'
                              ? 'bg-primary-visible text-primary border-2 border-primary-visible'
                              : 'bg-muted text-muted-foreground border border-border'
                          }`}
                        >
                          {project.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
                    <div className="flex flex-wrap gap-3 sm:gap-6 text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">{totalVideos}</span> video
                        {totalVideos !== 1 ? 's' : ''}
                      </div>
                      <div>
                        <span className="font-medium">{readyVideos}</span> ready
                      </div>
                      <div>
                        <span className="font-medium">{project._count.comments}</span> comment
                        {project._count.comments !== 1 ? 's' : ''}
                      </div>
                      <div className="w-full sm:w-auto sm:ml-auto text-xs sm:text-sm">
                        Updated {formatDate(project.updatedAt)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })
        )}
      </div>
    </>
  )
}
