'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, ArrowUpDown, Video, MessageSquare, ChevronRight, Calendar } from 'lucide-react'
import ViewModeToggle, { type ViewMode } from '@/components/ViewModeToggle'
import FilterDropdown from '@/components/FilterDropdown'
import { formatDate } from '@/lib/utils'

const STATUS_OPTIONS_KEYS = ['IN_REVIEW', 'APPROVED', 'SHARE_ONLY', 'ARCHIVED'] as const

interface Project {
  id: string
  title: string
  companyName: string | null
  status: string
  createdAt: Date
  updatedAt: Date
  maxRevisions: number
  enableRevisions: boolean
  dueDate: string | null
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
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const tn = useTranslations('nav')
  const STATUS_OPTIONS = STATUS_OPTIONS_KEYS.map(value => ({
    value,
    label: value === 'IN_REVIEW' ? t('statusInReview') :
           value === 'APPROVED' ? t('statusApproved') :
           value === 'SHARE_ONLY' ? t('statusShareOnly') :
           t('statusArchived'),
  }))
  const [sortMode, setSortMode] = useState<'status' | 'alphabetical' | 'alphabetical-reverse' | 'dueDate'>(() => {
    // Load sort mode from localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('admin_projects_sort_mode')
      if (stored === 'status' || stored === 'alphabetical' || stored === 'alphabetical-reverse' || stored === 'dueDate') {
        return stored
      }
    }
    return 'alphabetical'
  })
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  // Use external filter if provided, otherwise use internal filter (default: all except ARCHIVED)
  const [internalStatusFilter, setInternalStatusFilter] = useState<Set<string>>(
    new Set(STATUS_OPTIONS_KEYS.filter(v => v !== 'ARCHIVED'))
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

  function getDueDateColor(dueDate: string, status: string): string {
    // Completed projects (approved, archived, share-only) should never show overdue styling
    if (status === 'APPROVED' || status === 'ARCHIVED' || status === 'SHARE_ONLY') {
      return 'text-muted-foreground'
    }
    const due = new Date(dueDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
    const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000)
    if (diffDays < 0) return 'text-destructive'
    if (diffDays <= 1) return 'text-warning'
    if (diffDays <= 7) return 'text-primary'
    return 'text-muted-foreground'
  }

  // Filter projects by status
  const filteredProjects = projects.filter(p => statusFilter.has(p.status))

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sortMode === 'alphabetical') {
      return a.title.localeCompare(b.title)
    } else if (sortMode === 'alphabetical-reverse') {
      return b.title.localeCompare(a.title)
    } else if (sortMode === 'dueDate') {
      // Projects with due dates first, sorted earliest first
      if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title)
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
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
              label: tc('status'),
              options: STATUS_OPTIONS,
              selected: statusFilter,
              onChange: setStatusFilter,
            }]}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortMode(current => {
              const cycle: typeof current[] = ['alphabetical', 'alphabetical-reverse', 'status', 'dueDate']
              return cycle[(cycle.indexOf(current) + 1) % cycle.length]
            })}
            title={sortMode === 'alphabetical' ? t('sortByStatus') : sortMode === 'status' ? t('sortByDueDate') : t('sortAlphabetically')}
          >
            {sortMode === 'dueDate' ? <Calendar className="w-4 h-4" /> : <ArrowUpDown className="w-4 h-4" />}
            <span className="hidden sm:inline ml-2">
              {sortMode === 'alphabetical' ? t('aToZ') : sortMode === 'alphabetical-reverse' ? t('zToA') : sortMode === 'status' ? tc('status') : t('dueDateLabel')}
            </span>
          </Button>
        </div>
      )}

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">{t('noProjectsYet')}</p>
            <Link href="/admin/projects/new">
              <Button variant="default" size="default">
                <Plus className="w-4 h-4 mr-2" />
                {t('createFirst')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {sortedProjects.map((project) => {
            const totalVideos = project.videos.length
            const primaryRecipient = project.recipients?.find((r: any) => r.isPrimary) || project.recipients?.[0]
            const displayName = project.companyName || primaryRecipient?.name || primaryRecipient?.email || t('client')

            return (
              <Link key={project.id} href={`/admin/projects/${project.id}`} className="block">
                <Card className="h-full cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-elevation-lg sm:hover:-translate-y-1">
                  <CardHeader className="p-2 sm:p-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="font-semibold text-sm sm:text-base">
                          {project.title}
                        </CardTitle>
                        <CardDescription className="mt-1 break-words text-xs sm:text-sm">
                          {t('clientLabel')} {displayName}
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
                        {{ IN_REVIEW: t('statusInReview'), APPROVED: t('statusApproved'), SHARE_ONLY: t('statusShareOnly'), ARCHIVED: t('statusArchived') }[project.status] || project.status}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 pt-0 sm:p-3 sm:pt-0">
                    <div className="flex flex-wrap gap-3 sm:gap-6 text-muted-foreground text-xs sm:text-sm min-h-[28px] sm:min-h-[32px]">
                      <div className="inline-flex items-center gap-2">
                        <span className={metricIconWrapperClassName}>
                          <Video className={metricIconClassName} />
                        </span>
                        <span className="font-medium">{totalVideos}</span>
                        <span className="hidden sm:inline">{totalVideos !== 1 ? t('videosPlural') : t('video')}</span>
                      </div>
                      <div className="inline-flex items-center gap-2">
                        <span className={metricIconWrapperClassName}>
                          <MessageSquare className={metricIconClassName} />
                        </span>
                        <span className="font-medium">{project._count.comments}</span>
                        <span className="hidden sm:inline">{project._count.comments !== 1 ? t('commentsPlural') : t('comment')}</span>
                      </div>
                      {project.dueDate && (
                        <div className={`inline-flex items-center gap-2 ${getDueDateColor(project.dueDate, project.status)}`}>
                          <span className={metricIconWrapperClassName}>
                            <Calendar className={metricIconClassName} />
                          </span>
                          <span className="font-medium text-xs">{new Date(project.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        </div>
                      )}
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
            <span className="text-sm font-medium">{tn('projects')}</span>
            <span className="text-xs text-muted-foreground">{sortedProjects.length} {t('projectsCount')}</span>
          </div>
          {/* Table Header */}
          <div className="hidden sm:flex items-center gap-4 px-5 py-2 text-xs text-muted-foreground bg-muted/20 border-b">
            <span className="flex-1 min-w-0">{tc('name')}</span>
            <span className="w-36 hidden md:block">{t('client')}</span>
            <span className="w-28">{tc('status')}</span>
            <span className="w-14 text-center hidden lg:block">{t('videos')}</span>
            <span className="w-14 text-center hidden lg:block">{t('comments')}</span>
            <span className="w-24 hidden lg:block">{t('dueDateLabel')}</span>
            <span className="w-24 hidden xl:block">{tc('created')}</span>
            <span className="w-24 hidden lg:block">{tc('updated')}</span>
            <span className="w-4"></span>
          </div>
          <div className="divide-y">
            {sortedProjects.map((project) => {
              const totalVideos = project.videos.length
              const primaryRecipient = project.recipients?.find((r: any) => r.isPrimary) || project.recipients?.[0]
              const displayName = project.companyName || primaryRecipient?.name || primaryRecipient?.email || t('client')

              return (
                <Link
                  key={project.id}
                  href={`/admin/projects/${project.id}`}
                  className="flex items-center gap-4 px-5 py-3 text-sm hover:bg-accent/30 transition-colors"
                >
                  <span className="flex-1 min-w-0 font-medium truncate">{project.title}</span>
                  <span className="w-36 text-xs text-muted-foreground truncate hidden md:block">{displayName}</span>
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
                      {{ IN_REVIEW: t('statusInReview'), APPROVED: t('statusApproved'), SHARE_ONLY: t('statusShareOnly'), ARCHIVED: t('statusArchived') }[project.status] || project.status}
                    </span>
                  </span>
                  <span className="w-14 text-center text-xs text-muted-foreground tabular-nums hidden lg:block">{totalVideos}</span>
                  <span className="w-14 text-center text-xs text-muted-foreground tabular-nums hidden lg:block">{project._count.comments}</span>
                  <span className={`w-24 text-xs hidden lg:block ${project.dueDate ? getDueDateColor(project.dueDate, project.status) : 'text-muted-foreground'}`}>
                    {project.dueDate ? new Date(project.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                  </span>
                  <span className="w-24 text-xs text-muted-foreground hidden xl:block">
                    {formatDate(project.createdAt)}
                  </span>
                  <span className="w-24 text-xs text-muted-foreground hidden lg:block">
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
