'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import AdminVideoManager from '@/components/AdminVideoManager'
import ProjectActions from '@/components/ProjectActions'
import { ArrowLeft, Settings, ArrowUpDown, Video, Upload } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

// Force dynamic rendering (no static pre-rendering)
export const dynamic = 'force-dynamic'

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [shareUrl, setShareUrl] = useState('')
  const [sortMode, setSortMode] = useState<'status' | 'alphabetical'>('alphabetical')
  const videoManagerRef = useRef<{ triggerUpload: () => void } | null>(null)

  // Fetch project data function (extracted so it can be called on upload complete)
  const fetchProject = async () => {
    try {
      const response = await apiFetch(`/api/projects/${id}`)
      if (!response.ok) {
        if (response.status === 404) {
          router.push('/admin/projects')
          return
        }
        throw new Error('Failed to fetch project')
      }
      const data = await response.json()
      setProject(data)
    } catch (error) {
      console.error('Error fetching project:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch project data on mount
  useEffect(() => {
    fetchProject()
  }, [id, router])

  // Listen for immediate updates (approval changes, comment deletes/posts, etc.)
  useEffect(() => {
    const handleUpdate = () => fetchProject()

    const handleCommentPosted = (e: Event) => {
      const customEvent = e as CustomEvent
      if (customEvent.detail?.comments) {
        setProject((prev: any) => prev ? { ...prev, comments: customEvent.detail.comments } : prev)
      } else {
        fetchProject()
      }
    }

    window.addEventListener('videoApprovalChanged', handleUpdate)
    window.addEventListener('commentDeleted', handleUpdate)
    window.addEventListener('commentPosted', handleCommentPosted as EventListener)

    return () => {
      window.removeEventListener('videoApprovalChanged', handleUpdate)
      window.removeEventListener('commentDeleted', handleUpdate)
      window.removeEventListener('commentPosted', handleCommentPosted as EventListener)
    }
  }, [id])

  // Auto-refresh when videos are processing to show real-time progress
  // Centralized polling to prevent duplicate network requests
  useEffect(() => {
    if (!project?.videos) return

    // Check if any videos are currently processing
    const hasProcessingVideos = project.videos.some(
      (video: any) => video.status === 'PROCESSING' || video.status === 'UPLOADING'
    )

    if (hasProcessingVideos) {
      // Poll every 5 seconds while videos are processing (reduced from 3s to reduce load)
      const interval = setInterval(() => {
        fetchProject()
      }, 5000)

      return () => clearInterval(interval)
    }
  }, [project?.videos])

  // Fetch share URL
  useEffect(() => {
    async function fetchShareUrl() {
      if (!project?.slug) return
      try {
        const response = await apiFetch(`/api/share/url?slug=${project.slug}`)
        if (response.ok) {
          const data = await response.json()
          setShareUrl(data.shareUrl)
        }
      } catch (error) {
        console.error('Error fetching share URL:', error)
      }
    }

    fetchShareUrl()
  }, [project?.slug])


  if (loading) {
    return (
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Project not found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Filter comments to only show comments for active videos
  const iconBadgeClassName = 'rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10'
  const iconBadgeIconClassName = 'w-4 h-4 text-primary'

  return (
    <div className="flex-1 min-h-0 bg-background">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <Link href="/admin/projects">
            <Button variant="ghost" size="default" className="justify-start px-3">
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Back to Projects</span>
              <span className="sm:hidden">Back</span>
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            {project && project.status !== 'APPROVED' && (
              <Button
                variant="default"
                size="default"
                onClick={() => videoManagerRef.current?.triggerUpload()}
              >
                <Upload className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Upload Video(s)</span>
              </Button>
            )}
            <Link href={`/admin/projects/${id}/settings`}>
              <Button variant="outline" size="default">
                <Settings className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Project Settings</span>
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Actions Panel - Top on mobile, right on desktop */}
          <div className="lg:col-start-3 lg:row-start-1 min-w-0">
            <ProjectActions
              project={project}
              videos={project.videos}
              onRefresh={fetchProject}
              shareUrl={shareUrl}
              recipients={project.recipients || []}
            />
          </div>

          {/* Videos Section - Below actions on mobile, left on desktop */}
          <div className="lg:col-span-2 lg:row-start-1 space-y-6 min-w-0">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <span className={iconBadgeClassName}>
                    <Video className={iconBadgeIconClassName} />
                  </span>
                  Videos
                </h2>
                {project.videos.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSortMode(current => current === 'status' ? 'alphabetical' : 'status')}
                    className="text-muted-foreground hover:text-foreground"
                    title={sortMode === 'status' ? 'Sort alphabetically' : 'Sort by status'}
                  >
                    <ArrowUpDown className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <AdminVideoManager
                ref={videoManagerRef}
                projectId={project.id}
                videos={project.videos}
                projectStatus={project.status}
                restrictToLatestVersion={project.restrictCommentsToLatestVersion}
                onRefresh={fetchProject}
                sortMode={sortMode}
                maxRevisions={project.maxRevisions}
                enableRevisions={project.enableRevisions}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
