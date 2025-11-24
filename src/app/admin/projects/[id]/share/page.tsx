'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import VideoPlayer from '@/components/VideoPlayer'
import CommentSection from '@/components/CommentSection'
import VideoSidebar from '@/components/VideoSidebar'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-client'

export default function AdminSharePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [project, setProject] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [companyName, setCompanyName] = useState('Studio')
  const [defaultQuality, setDefaultQuality] = useState<'720p' | '1080p'>('720p')

  useEffect(() => {
    const loadProject = async () => {
      try {
        const response = await apiFetch(`/api/projects/${id}`)
        if (!response.ok) {
          setError(true)
          return
        }

        const projectData = await response.json()
        setProject(projectData)

        if (projectData.settings) {
          setCompanyName(projectData.settings.companyName || 'Studio')
          setDefaultQuality(projectData.settings.defaultPreviewResolution || '720p')
        }

        // Load comments if feedback is not hidden
        if (!projectData.hideFeedback) {
          loadComments()
        }
      } catch (error) {
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    loadProject()
  }, [id])

  const loadComments = async () => {
    setCommentsLoading(true)
    try {
      const response = await apiFetch(`/api/comments?projectId=${id}`)
      if (response.ok) {
        const data = await response.json()
        setComments(data)
      }
    } catch (error) {
      // Failed to load comments
    } finally {
      setCommentsLoading(false)
    }
  }

  const refreshProject = async () => {
    try {
      const response = await apiFetch(`/api/projects/${id}`)
      if (response.ok) {
        const projectData = await response.json()
        setProject(projectData)
      }
    } catch (error) {
      // Failed to refresh
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Project not found</p>
          <Link href="/admin/projects">
            <Button>Back to Projects</Button>
          </Link>
        </div>
      </div>
    )
  }

  const readyVideos = project.videos?.filter((v: any) => v.status === 'READY') || []

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Admin Banner */}
      <div className="bg-primary-visible border-b-2 border-primary-visible">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-primary font-medium">
            Admin Mode: Viewing share page as admin • You can comment as {companyName}
          </p>
          <Link href={`/admin/projects/${id}`}>
            <Button variant="outline" size="sm" className="flex-shrink-0">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-8 flex-1 min-h-0 flex flex-col">
          {readyVideos.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground">No videos available</p>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 flex-1 min-h-0">
              {/* Video Player */}
              <div className="flex-1 min-w-0">
                <VideoPlayer
                  videos={readyVideos}
                  projectId={project.id}
                  projectStatus={project.status}
                  defaultQuality={defaultQuality}
                  onApprove={refreshProject}
                  projectTitle={project.title}
                  projectDescription={project.description}
                  clientName={companyName}
                  isPasswordProtected={!!project.sharePassword}
                  watermarkEnabled={project.watermarkEnabled ?? true}
                  isAdmin={true}
                  isGuest={false}
                  allowAssetDownload={project.allowAssetDownload}
                  shareToken={null}
                />
              </div>

              {/* Comments Section */}
              {!project.hideFeedback && (
                <div className="lg:w-96 flex-shrink-0">
                  <CommentSection
                    projectId={project.id}
                    videos={readyVideos}
                    comments={comments}
                    isApproved={project.status === 'APPROVED' || project.status === 'SHARE_ONLY'}
                    restrictToLatestVersion={project.restrictCommentsToLatestVersion}
                    isAdminView={true}
                    companyName={companyName}
                    clientCompanyName={project.companyName}
                    smtpConfigured={project.smtpConfigured}
                    isPasswordProtected={!!project.sharePassword}
                    recipients={project.recipients || []}
                    shareToken={null}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
