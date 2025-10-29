'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import VideoPlayer from '@/components/VideoPlayer'
import CommentSection from '@/components/CommentSection'
import VideoSidebar from '@/components/VideoSidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Button } from '@/components/ui/button'
import { Lock, Check } from 'lucide-react'

export default function SharePage() {
  const params = useParams()
  const token = params?.token as string

  const [isPasswordProtected, setIsPasswordProtected] = useState<boolean | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [project, setProject] = useState<any>(null)
  const [companyName, setCompanyName] = useState('Studio')
  const [defaultQuality, setDefaultQuality] = useState<'720p' | '1080p'>('720p')
  const [activeVideoName, setActiveVideoName] = useState<string>('')
  const [activeVideos, setActiveVideos] = useState<any[]>([])

  // Fetch project data function (for refresh after approval)
  const fetchProjectData = async () => {
    try {
      const projectResponse = await fetch(`/api/share/${token}`, {
        credentials: 'include'
      })
      if (projectResponse.ok) {
        const projectData = await projectResponse.json()
        setProject(projectData)
      }
    } catch (error) {
      console.error('Error fetching project data:', error)
    }
  }

  // Fetch company name and default quality from public settings
  useEffect(() => {
    async function fetchPublicSettings() {
      try {
        const response = await fetch('/api/settings/public')
        if (response.ok) {
          const data = await response.json()
          setCompanyName(data.companyName || 'Studio')
          setDefaultQuality(data.defaultPreviewResolution || '720p')
        }
      } catch (error) {
        // Keep defaults on error
      }
    }

    fetchPublicSettings()
  }, [])

  // Check if project requires password
  useEffect(() => {
    let isMounted = true // Prevent state updates after unmount
    let hasInitiallyLoaded = false // Prevent duplicate initial load

    async function checkAuth() {
      try {
        const response = await fetch(`/api/share/${token}/check`, {
          credentials: 'include'
        })

        if (!isMounted) return // Component unmounted, abort

        if (!response.ok) {
          // If 404, redirect to home page (invalid share link)
          if (response.status === 404) {
            window.location.href = '/'
            return
          }

          // If check fails, try to fetch project directly (no password protection)
          const directResponse = await fetch(`/api/share/${token}`, {
            credentials: 'include'
          })

          if (!isMounted) return // Component unmounted, abort

          if (directResponse.status === 404) {
            // Invalid share link - redirect to home
            window.location.href = '/'
            return
          }

          if (directResponse.ok) {
            const projectData = await directResponse.json()
            if (isMounted) {
              setProject(projectData)
              setIsPasswordProtected(false)
              setIsAuthenticated(true)
            }
          }
          return
        }

        const data = await response.json()

        if (!isMounted) return // Component unmounted, abort

        setIsPasswordProtected(data.requiresPassword)
        setIsAuthenticated(data.isAuthenticated)

        if (!data.requiresPassword || data.isAuthenticated) {
          // Fetch project data
          const projectResponse = await fetch(`/api/share/${token}`, {
            credentials: 'include'
          })

          if (!isMounted) return // Component unmounted, abort

          if (projectResponse.status === 404) {
            // Invalid share link - redirect to home
            window.location.href = '/'
            return
          }

          if (projectResponse.ok) {
            const projectData = await projectResponse.json()
            if (isMounted) {
              setProject(projectData)
            }
          }
        }
      } catch (error) {
        // Silent fail - auth errors handled by UI state
      }
    }

    // Only run initial check once
    if (!hasInitiallyLoaded) {
      hasInitiallyLoaded = true
      checkAuth()
    }

    // Auto-refresh every 30 seconds to get latest data (new videos, approval status)
    const intervalId = setInterval(() => {
      if (isMounted && isAuthenticated) {
        checkAuth()
      }
    }, 30000)

    return () => {
      isMounted = false // Mark component as unmounted
      clearInterval(intervalId)
    }
  }, [token]) // Removed isAuthenticated from dependencies to prevent double-load

  // Set active video when project loads
  useEffect(() => {
    if (project?.videosByName) {
      const videoNames = Object.keys(project.videosByName)
      if (videoNames.length > 0 && !activeVideoName) {
        // Check if there's a saved video name from recent approval
        const savedVideoName = sessionStorage.getItem('approvedVideoName')

        // Clear the saved name immediately after reading
        if (savedVideoName) {
          sessionStorage.removeItem('approvedVideoName')
        }

        // Use the saved name if it exists in the current videos, otherwise use first
        const videoNameToUse = savedVideoName && project.videosByName[savedVideoName]
          ? savedVideoName
          : videoNames[0]

        setActiveVideoName(videoNameToUse)
        setActiveVideos(project.videosByName[videoNameToUse])
      }
    }
  }, [project, activeVideoName])

  // Prevent auto-scroll on page load
  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0)

    // Also scroll the main content div to top
    const mainContent = document.querySelector('.flex-1.flex.flex-col.overflow-y-auto')
    if (mainContent) {
      mainContent.scrollTop = 0
    }
  }, [])

  // Handle video selection
  const handleVideoSelect = (videoName: string) => {
    setActiveVideoName(videoName)
    setActiveVideos(project.videosByName[videoName])
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/share/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include'
      })

      if (response.ok) {
        setIsAuthenticated(true)

        // Fetch project data
        const projectResponse = await fetch(`/api/share/${token}`, {
          credentials: 'include'
        })
        if (projectResponse.ok) {
          const projectData = await projectResponse.json()
          setProject(projectData)
        }
      } else {
        setError('Incorrect password')
      }
    } catch (error) {
      setError('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Show loading state
  if (isPasswordProtected === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // Show password prompt
  if (isPasswordProtected && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="bg-card border-border w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Lock className="w-12 h-12 text-muted-foreground" />
            </div>
            <CardTitle className="text-foreground">Password Protected</CardTitle>
            <p className="text-muted-foreground text-sm mt-2">
              This project is password protected. Please enter the password to continue.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <PasswordInput
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button
                type="submit"
                variant="default"
                size="default"
                disabled={loading || !password}
                className="w-full"
              >
                <Check className="w-4 h-4 mr-2" />
                {loading ? 'Verifying...' : 'Submit'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show project not found
  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Project not found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const readyVideos = activeVideos.filter((v: any) => v.status === 'READY')
  const hasMultipleVideos = project.videosByName && Object.keys(project.videosByName).length > 1

  // Filter comments to only show comments for active videos
  const activeVideoIds = new Set(activeVideos.map((v: any) => v.id))
  const filteredComments = project?.comments?.filter((comment: any) => {
    // Show general comments (no videoId) or comments for active videos
    return !comment.videoId || activeVideoIds.has(comment.videoId)
  }) || []

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row overflow-x-hidden">
      {/* Video Sidebar - contains both desktop and mobile versions internally */}
      {project.videosByName && (
        <VideoSidebar
          videosByName={project.videosByName}
          activeVideoName={activeVideoName}
          onVideoSelect={handleVideoSelect}
          className="w-64 flex-shrink-0"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
        {/* Content Area */}
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
          {/* Content Area */}
          {readyVideos.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No videos are ready for review yet. Please check back later.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className={`grid gap-4 sm:gap-6 ${project.hideFeedback ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-3'}`}>
              {/* Video Player - centered */}
              <div className={project.hideFeedback ? 'w-full' : 'lg:col-span-2'}>
                <VideoPlayer
                  videos={readyVideos}
                  projectId={project.id}
                  projectStatus={project.status}
                  defaultQuality={defaultQuality}
                  projectTitle={project.title}
                  projectDescription={project.description}
                  clientName={project.clientName}
                  currentRevision={project.currentRevision}
                  maxRevisions={project.maxRevisions}
                  enableRevisions={project.enableRevisions}
                  isPasswordProtected={isPasswordProtected || false}
                  watermarkEnabled={project.watermarkEnabled}
                  activeVideoName={activeVideoName}
                  onApprove={fetchProjectData}
                />
              </div>

              {/* Comments Section */}
              {!project.hideFeedback && (
                <div className="lg:sticky lg:top-6 lg:self-start">
                  <CommentSection
                    projectId={project.id}
                    comments={filteredComments}
                    clientName={project.clientName}
                    clientEmail={project.clientEmail}
                    isApproved={project.status === 'APPROVED' || project.status === 'SHARE_ONLY'}
                    restrictToLatestVersion={project.restrictCommentsToLatestVersion}
                    videos={readyVideos}
                    isAdminView={false}
                    companyName={companyName}
                    smtpConfigured={project.smtpConfigured}
                    isPasswordProtected={isPasswordProtected || false}
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
