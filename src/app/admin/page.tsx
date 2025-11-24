'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { FolderKanban, Plus } from 'lucide-react'
import ProjectsList from '@/components/ProjectsList'
import { apiFetch } from '@/lib/api-client'
import type { Project } from '@prisma/client'

export default function AdminPage() {
  const [projects, setProjects] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch('/api/projects')
        if (!res.ok) throw new Error('Failed to load projects')
        const data = await res.json()
        setProjects(data.projects || data || [])
      } catch (error) {
        setProjects([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading projects...</p>
      </div>
    )
  }

  if (!projects || projects.length === 0) {
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
              <Button variant="default" size="lg">
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
            <Button variant="default" size="lg">
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
