import { prisma } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { BarChart3, Video, Eye } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getProjectsWithAnalytics() {
  const projects = await prisma.project.findMany({
    include: {
      videos: {
        where: { status: 'READY' },
      },
      recipients: {
        where: { isPrimary: true },
        take: 1,
      },
      analytics: {
        select: {
          eventType: true,
        },
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
  })

  return projects.map(project => {
    const totalDownloads = project.analytics.filter(a => a.eventType === 'DOWNLOAD_COMPLETE').length
    const totalPageVisits = project.analytics.filter(a => a.eventType === 'PAGE_VISIT').length

    return {
      id: project.id,
      title: project.title,
      recipientName: project.recipients[0]?.name || null,
      recipientEmail: project.recipients[0]?.email || null,
      status: project.status,
      videoCount: project.videos.length,
      totalDownloads,
      totalPageVisits,
      updatedAt: project.updatedAt,
    }
  })
}

export default async function AnalyticsDashboard() {
  const projects = await getProjectsWithAnalytics()

  const totalStats = projects.reduce(
    (acc, project) => ({
      downloads: acc.downloads + project.totalDownloads,
      pageVisits: acc.pageVisits + project.totalPageVisits,
    }),
    { downloads: 0, pageVisits: 0 }
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Video analytics and usage metrics
          </p>
        </div>

        <div className="grid gap-4 sm:gap-6 md:grid-cols-2 mb-6 sm:mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Project Visits</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalStats.pageVisits.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Downloads</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalStats.downloads.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 sm:gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Projects</CardTitle>
              <CardDescription>Click on a project to view detailed analytics</CardDescription>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No analytics data available yet
                </p>
              ) : (
                <div className="space-y-3">
                  {projects.map((project) => (
                    <Link key={project.id} href={`/admin/analytics/${project.id}`}>
                      <div className="flex items-center justify-between p-4 rounded-lg border-2 border-border bg-card hover:bg-muted hover:shadow-xl shadow-md dark:shadow-[0_4px_16px_rgba(255,255,255,0.08)] dark:hover:shadow-[0_8px_24px_rgba(255,255,255,0.12)] hover:-translate-y-1 hover:border-primary/50 transition-all duration-200 cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium truncate">{project.title}</h3>
                          {(project.recipientName || project.recipientEmail) && (
                            <p className="text-sm text-muted-foreground">
                              Client: {project.recipientName || project.recipientEmail}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-4 sm:gap-6 text-sm">
                          <div className="text-center">
                            <div className="font-medium">{project.totalPageVisits}</div>
                            <div className="text-xs text-muted-foreground">Visits</div>
                          </div>
                          <div className="text-center">
                            <div className="font-medium">{project.totalDownloads}</div>
                            <div className="text-xs text-muted-foreground">Downloads</div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
