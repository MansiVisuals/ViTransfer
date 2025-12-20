'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, ArrowUpDown } from 'lucide-react'
import { formatDate } from '@/lib/utils'

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
        <div className="flex justify-end mb-4">
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

      <div className="grid gap-4 sm:gap-6">
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
                <Card className="hover:shadow-elevation-lg hover:-translate-y-1 hover:border-primary/50 transition-all duration-200 cursor-pointer">
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg sm:text-xl">{project.title}</CardTitle>
                        <CardDescription className="mt-2 text-sm break-words">
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
                          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
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
                  <CardContent>
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
