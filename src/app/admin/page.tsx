import { prisma } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { formatDuration, formatFileSize } from '@/lib/utils'
import { getCompanyName } from '@/lib/settings'
import { Plus } from 'lucide-react'

// Force dynamic rendering (no static pre-rendering)
export const dynamic = 'force-dynamic'

async function getProjects() {
  const projects = await prisma.project.findMany({
    include: {
      videos: true,
      recipients: {
        where: { isPrimary: true },
        take: 1,
      },
      _count: {
        select: { comments: true },
      },
    },
  })

  // Custom sorting: IN_REVIEW > SHARE_ONLY > APPROVED
  // Within each status group: newest first (updatedAt desc)
  const statusPriority = {
    IN_REVIEW: 1,
    SHARE_ONLY: 2,
    APPROVED: 3,
  }

  return projects.sort((a, b) => {
    // Sort by status priority first
    const priorityDiff = statusPriority[a.status] - statusPriority[b.status]
    if (priorityDiff !== 0) return priorityDiff

    // Within same status, sort by updatedAt (newest first)
    return b.updatedAt.getTime() - a.updatedAt.getTime()
  })
}

export default async function AdminPage() {
  const projects = await getProjects()
  const companyName = await getCompanyName()

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{companyName} Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">Manage your video projects</p>
          </div>
          <Link href="/admin/projects/new">
            <Button variant="default" size="default" className="w-full sm:w-auto">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">New Project</span>
            </Button>
          </Link>
        </div>

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
            projects.map((project) => {
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
                            {project.recipients && project.recipients.length > 0 ? (
                              <>
                                Client: {project.recipients[0].name || project.recipients[0].email || 'No contact info'}
                                {project.recipients[0].name && project.recipients[0].email && (
                                  <>
                                    <span className="hidden sm:inline"> ({project.recipients[0].email})</span>
                                    <span className="block sm:hidden text-xs mt-1">{project.recipients[0].email}</span>
                                  </>
                                )}
                              </>
                            ) : (
                              'No recipient'
                            )}
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
                          {project.enableRevisions && (
                            <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                              Revision {project.currentRevision}/{project.maxRevisions}
                            </span>
                          )}
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
                          Updated {new Date(project.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
