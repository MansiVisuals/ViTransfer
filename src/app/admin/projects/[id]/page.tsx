'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import AdminVideoManager from '@/components/AdminVideoManager'
import ProjectActions from '@/components/ProjectActions'
import ShareLink from '@/components/ShareLink'
import AdminFeedbackSection from '@/components/AdminFeedbackSection'
import { ArrowLeft, Settings } from 'lucide-react'

// Force dynamic rendering (no static pre-rendering)
export const dynamic = 'force-dynamic'

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [shareUrl, setShareUrl] = useState('')
  const [companyName, setCompanyName] = useState('Studio')
  const [activeVideoName, setActiveVideoName] = useState<string>('')
  const [activeVideos, setActiveVideos] = useState<any[]>([])

  // Fetch project data function (extracted so it can be called on upload complete)
  const fetchProject = async () => {
    try {
      const response = await fetch(`/api/projects/${id}`)
      if (!response.ok) {
        if (response.status === 404) {
          router.push('/admin')
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

  // Auto-refresh when videos are processing to show real-time progress
  useEffect(() => {
    if (!project?.videos) return

    // Check if any videos are currently processing
    const hasProcessingVideos = project.videos.some(
      (video: any) => video.status === 'PROCESSING' || video.status === 'UPLOADING'
    )

    if (hasProcessingVideos) {
      // Poll every 3 seconds while videos are processing
      const interval = setInterval(() => {
        fetchProject()
      }, 3000)

      return () => clearInterval(interval)
    }
  }, [project?.videos])

  // Fetch share URL
  useEffect(() => {
    async function fetchShareUrl() {
      if (!project?.slug) return
      try {
        const response = await fetch(`/api/share/url?slug=${project.slug}`)
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

  // Fetch company name
  useEffect(() => {
    async function fetchCompanyName() {
      try {
        const response = await fetch('/api/settings/public')
        if (response.ok) {
          const data = await response.json()
          setCompanyName(data.companyName || 'Studio')
        }
      } catch (error) {
        console.error('Error fetching company name:', error)
      }
    }

    fetchCompanyName()
  }, [])

  // Handle video selection
  const handleVideoSelect = (videoName: string, videos: any[]) => {
    setActiveVideoName(videoName)
    setActiveVideos(videos)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Project not found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Filter comments to only show comments for active videos
  const activeVideoIds = new Set(activeVideos.map((v: any) => v.id))
  const filteredComments = project?.comments?.filter((comment: any) => {
    // Show general comments (no videoId) or comments for active videos
    return !comment.videoId || activeVideoIds.has(comment.videoId)
  }) || []

  const hideFeedback = (project as any).hideFeedback === true

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6 flex justify-between items-center">
          <Link href="/admin">
            <Button variant="ghost" size="default">
              <ArrowLeft className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Back to Dashboard</span>
            </Button>
          </Link>
          <Link href={`/admin/projects/${id}/settings`}>
            <Button variant="outline" size="default">
              <Settings className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Project Settings</span>
            </Button>
          </Link>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6 min-w-0">
            <Card className="overflow-hidden">
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="break-words">{project.title}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-2 break-words">{project.description}</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${
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
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className={`grid ${project.enableRevisions ? 'sm:grid-cols-2' : 'grid-cols-1'} gap-4 text-sm`}>
                    <div className="min-w-0">
                      <p className="text-muted-foreground">Client</p>
                      <p className="font-medium break-words">
                        {project.clientName}
                      </p>
                      <p className="text-xs text-muted-foreground break-all">
                        {project.clientEmail}
                      </p>
                    </div>
                    {project.enableRevisions && (
                      <div>
                        <p className="text-muted-foreground">Revisions</p>
                        <p className="font-medium">
                          {project.currentRevision}/{project.maxRevisions}
                        </p>
                      </div>
                    )}
                  </div>

                  <ShareLink shareUrl={shareUrl} />
                </div>
              </CardContent>
            </Card>

            <div>
              <h2 className="text-xl font-semibold mb-4">Videos</h2>
              <AdminVideoManager
                projectId={project.id}
                videos={project.videos}
                projectStatus={project.status}
                comments={project.comments}
                restrictToLatestVersion={project.restrictCommentsToLatestVersion}
                companyName={companyName}
                onVideoSelect={handleVideoSelect}
                onRefresh={fetchProject}
              />
            </div>
          </div>

          <div className="space-y-6 min-w-0">
            <ProjectActions project={project} videos={project.videos} onRefresh={fetchProject} />

            {!hideFeedback && activeVideoName && (
              <div className="lg:sticky lg:top-6">
                <AdminFeedbackSection
                  key={activeVideoName} // Force fresh component per video
                  projectId={project.id}
                  initialComments={filteredComments}
                  videos={activeVideos}
                  restrictToLatestVersion={project.restrictCommentsToLatestVersion}
                  companyName={companyName}
                  onRefresh={fetchProject}
                  projectSlug={project.slug}
                  activeVideoName={activeVideoName}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
