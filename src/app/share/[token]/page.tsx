'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import VideoPlayer from '@/components/VideoPlayer'
import CommentSection from '@/components/CommentSection'
import VideoSidebar from '@/components/VideoSidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Button } from '@/components/ui/button'
import { Lock, Check, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function SharePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = params?.token as string

  // Parse URL parameters for video seeking
  const urlTimestamp = searchParams?.get('t') ? parseInt(searchParams.get('t')!) : null
  const urlVideoName = searchParams?.get('video') || null
  const urlVersion = searchParams?.get('version') ? parseInt(searchParams.get('version')!) : null

  const [isPasswordProtected, setIsPasswordProtected] = useState<boolean | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [project, setProject] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [companyName, setCompanyName] = useState('Studio')
  const [defaultQuality, setDefaultQuality] = useState<'720p' | '1080p'>('720p')
  const [activeVideoName, setActiveVideoName] = useState<string>('')
  const [activeVideos, setActiveVideos] = useState<any[]>([])
  const [initialSeekTime, setInitialSeekTime] = useState<number | null>(null)
  const [initialVideoIndex, setInitialVideoIndex] = useState<number>(0)
  const [adminUser, setAdminUser] = useState<any>(null)

  // Fetch comments separately for security
  const fetchComments = async () => {
    if (!token) return

    setCommentsLoading(true)
    try {
      const response = await fetch(`/api/share/${token}/comments`, {
        credentials: 'include'
      })
      if (response.ok) {
        const commentsData = await response.json()
        setComments(commentsData)
      }
    } catch (error) {
      // Failed to load comments
    } finally {
      setCommentsLoading(false)
    }
  }

  // Fetch project data function (for refresh after approval)
  const fetchProjectData = async () => {
    try {
      const projectResponse = await fetch(`/api/share/${token}`, {
        credentials: 'include'
      })
      if (projectResponse.ok) {
        const projectData = await projectResponse.json()
        setProject(projectData)

        // Fetch comments after project loads (if not hidden)
        if (!projectData.hideFeedback) {
          fetchComments()
        }
      }
    } catch (error) {
      // Failed to load project data
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

  // Load project data (handles auth check implicitly via API response)
  useEffect(() => {
    let isMounted = true // Prevent state updates after unmount
    let hasInitiallyLoaded = false // Prevent duplicate initial load

    async function loadProject() {
      try {
        const response = await fetch(`/api/share/${token}`, {
          credentials: 'include'
        })

        if (!isMounted) return // Component unmounted, abort

        // Handle different response statuses
        if (response.status === 401) {
          // Password required
          const data = await response.json()
          if (isMounted) {
            setIsPasswordProtected(true)
            setIsAuthenticated(false)
          }
          return
        }

        if (response.status === 403 || response.status === 404) {
          // Invalid token or access denied - redirect to home
          window.location.href = '/'
          return
        }

        if (response.ok) {
          // Success - show project
          const projectData = await response.json()
          if (isMounted) {
            setProject(projectData)
            // Check if project is password-protected based on presence of recipients
            // (recipients are only included for password-protected projects)
            setIsPasswordProtected(!!projectData.recipients && projectData.recipients.length > 0)
            setIsAuthenticated(true)

            // Fetch comments separately (if not hidden)
            if (!projectData.hideFeedback) {
              fetchComments()
            }

            // Check if admin session exists (always check, doesn't expose anything)
            try {
              const adminResponse = await fetch('/api/auth/session', {
                credentials: 'include'
              })
              if (adminResponse.ok) {
                const adminData = await adminResponse.json()
                if (adminData.authenticated && adminData.user?.role === 'ADMIN') {
                  setAdminUser(adminData.user)
                }
              }
            } catch (error) {
              // Silent fail - not an admin
            }
          }
        }
      } catch (error) {
        // Silent fail - errors handled by UI state
      }
    }

    // Only run initial check once
    if (!hasInitiallyLoaded) {
      hasInitiallyLoaded = true
      loadProject()
    }

    // Auto-refresh every 30 seconds to get latest data (new videos, approval status)
    const intervalId = setInterval(() => {
      if (isMounted && isAuthenticated) {
        loadProject()
      }
    }, 30000)

    return () => {
      isMounted = false // Mark component as unmounted
      clearInterval(intervalId)
    }
  }, [token]) // Removed isAuthenticated from dependencies to prevent double-load

  // Set active video when project loads, handling URL parameters
  useEffect(() => {
    if (project?.videosByName) {
      const videoNames = Object.keys(project.videosByName)
      if (videoNames.length > 0 && !activeVideoName) {
        let videoNameToUse: string | null = null

        // Priority 1: URL parameter for video name
        if (urlVideoName && project.videosByName[urlVideoName]) {
          videoNameToUse = urlVideoName
        }
        // Priority 2: Saved video name from recent approval
        else {
          const savedVideoName = sessionStorage.getItem('approvedVideoName')
          if (savedVideoName) {
            sessionStorage.removeItem('approvedVideoName')
            if (project.videosByName[savedVideoName]) {
              videoNameToUse = savedVideoName
            }
          }
        }

        // Priority 3: First video
        if (!videoNameToUse) {
          videoNameToUse = videoNames[0]
        }

        setActiveVideoName(videoNameToUse)
        const videos = project.videosByName[videoNameToUse]
        setActiveVideos(videos)

        // If URL specifies a version, calculate the index for initial selection
        if (urlVersion !== null && videos) {
          const targetIndex = videos.findIndex((v: any) => v.version === urlVersion)
          if (targetIndex !== -1) {
            setInitialVideoIndex(targetIndex)
          }
        }

        // Set initial seek time if URL parameter exists
        if (urlTimestamp !== null) {
          setInitialSeekTime(urlTimestamp)
        }
      }
    }
  }, [project, activeVideoName, urlVideoName, urlVersion, urlTimestamp])

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

          // Fetch comments after successful auth (if not hidden)
          if (!projectData.hideFeedback) {
            fetchComments()
          }
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

  // Filter to READY videos first
  let readyVideos = activeVideos.filter((v: any) => v.status === 'READY')

  // If any video is approved, show ONLY approved videos (for both admin and client)
  const hasApprovedVideo = readyVideos.some((v: any) => v.approved)
  if (hasApprovedVideo) {
    readyVideos = readyVideos.filter((v: any) => v.approved)
  }

  const hasMultipleVideos = project.videosByName && Object.keys(project.videosByName).length > 1

  // Filter comments to only show comments for active videos
  const activeVideoIds = new Set(activeVideos.map((v: any) => v.id))
  const filteredComments = comments.filter((comment: any) => {
    // Show general comments (no videoId) or comments for active videos
    return !comment.videoId || activeVideoIds.has(comment.videoId)
  })

  return (
    <div className="h-screen bg-background flex flex-col lg:flex-row overflow-hidden">
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
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Admin Indicator */}
        {adminUser && (
          <div className="bg-primary-visible border-b-2 border-primary-visible">
            <div className="w-full px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
              <p className="text-sm text-primary font-medium">
                Admin Mode: Viewing as {adminUser.name || adminUser.email} • You can comment as {companyName}
              </p>
              <Link href={`/admin/projects/${project.id}`}>
                <Button variant="outline" size="sm" className="flex-shrink-0">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Admin
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-8 flex-1 min-h-0 flex flex-col">
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
            <div className={`flex-1 min-h-0 ${project.hideFeedback ? 'flex flex-col max-w-7xl mx-auto w-full' : 'grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3'}`}>
              {/* Video Player - centered */}
              <div className={project.hideFeedback ? 'flex-1 min-h-0 flex flex-col' : 'lg:col-span-2'}>
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
                  initialSeekTime={initialSeekTime}
                  initialVideoIndex={initialVideoIndex}
                  isAdmin={!!adminUser}
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
                    isAdminView={!!adminUser}
                    companyName={companyName}
                    smtpConfigured={project.smtpConfigured}
                    isPasswordProtected={isPasswordProtected || false}
                    adminUser={adminUser}
                    recipients={project.recipients || []}
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
