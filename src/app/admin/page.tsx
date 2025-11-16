import { prisma } from '@/lib/db'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { FolderKanban, Plus } from 'lucide-react'
import ProjectsList from '@/components/ProjectsList'

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

  return projects
}

export default async function AdminPage() {
  const projects = await getProjects()

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="flex justify-between items-center gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <FolderKanban className="w-7 h-7 sm:w-8 sm:h-8" />
              Projects Dashboard
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">Manage your video projects</p>
          </div>
          <Link href="/admin/projects/new">
            <Button variant="default" size="default">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">New Project</span>
            </Button>
          </Link>
        </div>

        <ProjectsList projects={projects} />
      </div>
    </div>
  )
}
