'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, ArrowUpDown, Video, MessageSquare, ChevronRight } from 'lucide-react'
import ViewModeToggle, { type ViewMode } from '@/components/ViewModeToggle'
import FilterDropdown from '@/components/FilterDropdown'
import { formatDate } from '@/lib/utils'

const STATUS_OPTIONS = [
  { value: 'IN_REVIEW', label: 'In Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SHARE_ONLY', label: 'Share Only' },
  { value: 'ARCHIVED', label: 'Archived' },
]

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
  statusFilter?: Set<string>
  onStatusFilterChange?: (filter: Set<string>) => void
}

export default function ProjectsList({ projects, statusFilter: externalStatusFilter, onStatusFilterChange }: ProjectsListProps) {
  const [sortMode, setSortMode] = useState<'status' | 'alphabetical'>(() => {
    // Load sort mode from localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('admin_projects_sort_mode')
      if (stored === 'status' || stored === 'alphabetical') {
        return stored
      }
    }
    return 'alphabetical'
  })
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  // Use external filter if provided, otherwise use internal filter (default: all except ARCHIVED)
  const [internalStatusFilter, setInternalStatusFilter] = useState<Set<string>>(
    new Set(STATUS_OPTIONS.filter(o => o.value !== 'ARCHIVED').map(o => o.value))
  )
  
  // Use external filter if provided, otherwise use internal
  const statusFilter = externalStatusFilter || internalStatusFilter
  const setStatusFilter = onStatusFilterChange || setInternalStatusFilter
  const metricIconWrapperClassName = 'rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10'
  const metricIconClassName = 'w-4 h-4 text-primary'

  useEffect(() => {
    const storageKey = 'admin_projects_view'
    const stored = localStorage.getItem(storageKey)

    if (stored === 'grid' || stored === 'table') {
      setViewMode(stored)
      return
    }
    // Migrate old 'list' preference to 'table'
    if (stored === 'list') {
      setViewMode('table')
      return
    }

    setViewMode('grid')
  }, [])

  useEffect(() => {
    localStorage.setItem('admin_projects_view', viewMode)
  }, [viewMode])

  // Save sort mode to localStorage
  useEffect(() => {
    localStorage.setItem('admin_projects_sort_mode', sortMode)
  }, [sortMode])

  // Filter projects by status
  const filteredProjects = projects.filter(p => statusFilter.has(p.status))

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sortMode === 'alphabetical') {
      return a.title.localeCompare(b.title)
    } else {
      // Status sorting
      const statusPriority: Record<string, number> = { IN_REVIEW: 1, SHARE_ONLY: 2, APPROVED: 3, ARCHIVED: 4 }
      const priorityDiff = (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99)
      if (priorityDiff !== 0) return priorityDiff
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    }
  })

  return (
    <>
      {projects.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <FilterDropdown
            groups={[{
              key: 'status',
              label: 'Status',
              options: STATUS_OPTIONS,
              selected: statusFilter,
              onChange: setStatusFilter,
            }]}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortMode(current => current === 'status' ? 'alphabetical' : 'status')}
            title={sortMode === 'status' ? 'Sort alphabetically' : 'Sort by status'}
          >
            <ArrowUpDown className="w-4 h-4" />
            <span className="hidden sm:inline ml-2">Sort</span>
          </Button>
        </div>
      )}

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
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {sortedProjects.map((project) => {
            const totalVideos = project.videos.length
            const primaryRecipient = project.recipients?.find((r: any) => r.isPrimary) || project.recipients?.[0]
            const displayName = project.companyName || primaryRecipient?.name || primaryRecipient?.email || 'Client'

            return (
              <Link key={project.id} href={`/admin/projects/${project.id}`} className="block">
                <Card className="cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-elevation-lg sm:hover:-translate-y-1">
                  <CardHeader className="p-2 sm:p-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="font-semibold text-sm sm:text-base">
                          {project.title}
                        </CardTitle>
                        <CardDescription className="mt-1 break-words text-xs sm:text-sm">
                          Client: {displayName}
                        </CardDescription>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                          project.status === 'APPROVED'
                            ? 'bg-success-visible text-success border-2 border-success-visible'
                          : project.status === 'SHARE_ONLY'
                            ? 'bg-info-visible text-info border-2 border-info-visible'
                          : project.status === 'IN_REVIEW'
                            ? 'bg-primary-visible text-primary border-2 border-primary-visible'
                          : project.status === 'ARCHIVED'
                            ? 'bg-muted text-muted-foreground border-2 border-muted'
                            : 'bg-muted text-muted-foreground border border-border'
                        }`}
                      >
                        {project.status.replace('_', ' ')}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 pt-0 sm:p-3 sm:pt-0">
                    <div className="flex flex-wrap gap-3 sm:gap-6 text-muted-foreground text-xs sm:text-sm">
                      <div className="inline-flex items-center gap-2">
                        <span className={metricIconWrapperClassName}>
                          <Video className={metricIconClassName} />
                        </span>
                        <span className="font-medium">{totalVideos}</span>
                        <span className="hidden sm:inline">video{totalVideos !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="inline-flex items-center gap-2">
                        <span className={metricIconWrapperClassName}>
                          <MessageSquare className={metricIconClassName} />
                        </span>
                        <span className="font-medium">{project._count.comments}</span>
                        <span className="hidden sm:inline">comment{project._count.comments !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        /* Table View */
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-b bg-muted/30">
            <span className="text-sm font-medium">Projects</span>
            <span className="text-xs text-muted-foreground">{sortedProjects.length} projects</span>
          </div>
          {/* Table Header */}
          <div className="hidden sm:flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-2 text-xs text-muted-foreground bg-muted/20 border-b">
            <span className="flex-1 min-w-0">Name</span>
            <span className="w-40 hidden md:block">Client</span>
            <span className="w-28">Status</span>
            <span className="w-16 text-center">Videos</span>
            <span className="w-16 text-center hidden lg:block">Comments</span>
            <span className="w-28 hidden lg:block">Updated</span>
            <span className="w-4"></span>
          </div>
          <div className="divide-y">
            {sortedProjects.map((project) => {
              const totalVideos = project.videos.length
              const primaryRecipient = project.recipients?.find((r: any) => r.isPrimary) || project.recipients?.[0]
              const displayName = project.companyName || primaryRecipient?.name || primaryRecipient?.email || 'Client'

              return (
                <Link
                  key={project.id}
                  href={`/admin/projects/${project.id}`}
                  className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-2.5 text-sm hover:bg-accent/30 transition-colors"
                >
                  <span className="flex-1 min-w-0 font-medium truncate">{project.title}</span>
                  <span className="w-40 text-xs text-muted-foreground truncate hidden md:block">{displayName}</span>
                  <span className="w-28">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                        project.status === 'APPROVED'
                          ? 'bg-success-visible text-success border-2 border-success-visible'
                        : project.status === 'SHARE_ONLY'
                          ? 'bg-info-visible text-info border-2 border-info-visible'
                        : project.status === 'IN_REVIEW'
                          ? 'bg-primary-visible text-primary border-2 border-primary-visible'
                        : project.status === 'ARCHIVED'
                          ? 'bg-muted text-muted-foreground border-2 border-muted'
                        : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {project.status.replace('_', ' ')}
                    </span>
                  </span>
                  <span className="w-16 text-center text-xs text-muted-foreground tabular-nums">{totalVideos}</span>
                  <span className="w-16 text-center text-xs text-muted-foreground tabular-nums hidden lg:block">{project._count.comments}</span>
                  <span className="w-28 text-xs text-muted-foreground hidden lg:block">
                    {formatDate(project.updatedAt)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </Link>
              )
            })}
          </div>
        </Card>
      )}
    </>
  )
}
