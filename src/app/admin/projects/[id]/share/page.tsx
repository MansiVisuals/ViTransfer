'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import VideoPlayer from '@/components/VideoPlayer'
import CommentSection from '@/components/CommentSection'
import VideoSidebar from '@/components/VideoSidebar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

export default function AdminSharePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const id = params?.id as string

  // Parse URL parameters for video seeking (same as public share page)
  const urlTimestamp = searchParams?.get('t') ? parseInt(searchParams.get('t')!, 10) : null
  const urlVideoName = searchParams?.get('video') || null
  const urlVersion = searchParams?.get('version') ? parseInt(searchParams.get('version')!, 10) : null

  const [project, setProject] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('Studio')
  const [defaultQuality, setDefaultQuality] = useState<'720p' | '1080p'>('720p')
  const [activeVideoName, setActiveVideoName] = useState<string>('')
  const [activeVideos, setActiveVideos] = useState<any[]>([])
  const [activeVideosRaw, setActiveVideosRaw] = useState<any[]>([])
  const [tokensLoading, setTokensLoading] = useState(false)
  const [initialSeekTime, setInitialSeekTime] = useState<number | null>(null)
  const [initialVideoIndex, setInitialVideoIndex] = useState<number>(0)
  const [adminUser, setAdminUser] = useState<any>(null)
  const tokenCacheRef = useRef<Map<string, any>>(new Map())
  const sessionIdRef = useRef<string>(`admin:${Date.now()}`)

  // Fetch comments separately for security (same pattern as public share)
  const fetchComments = async () => {
    if (!id) return

    setCommentsLoading(true)
    try {
      const response = await apiFetch(`/api/comments?projectId=${id}`)
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

  const transformProjectData = (projectData: any) => {
    const videosByName = projectData.videos.reduce((acc: any, video: any) => {
      const name = video.name
      if (!acc[name]) {
        acc[name] = []
      }
      acc[name].push(video)
      return acc
    }, {})

    // Sort versions within each video name (newest first)
    Object.keys(videosByName).forEach(name => {
      videosByName[name].sort((a: any, b: any) => b.version - a.version)
    })

    return {
      ...projectData,
      videosByName
    }
  }

  const fetchTokensForVideos = async (videos: any[]) => {
    const sessionId = sessionIdRef.current

    return Promise.all(
      videos.map(async (video: any) => {
        const cached = tokenCacheRef.current.get(video.id)
        if (cached) {
          return cached
        }

        try {
          const [response720p, response1080p] = await Promise.all([
            apiFetch(`/api/admin/video-token?videoId=${video.id}&projectId=${id}&quality=720p&sessionId=${sessionId}`),
            apiFetch(`/api/admin/video-token?videoId=${video.id}&projectId=${id}&quality=1080p&sessionId=${sessionId}`)
          ])

          let streamToken720p = ''
          let streamToken1080p = ''
          let downloadToken = null

          if (response720p.ok) {
            const data720p = await response720p.json()
            streamToken720p = data720p.token
          }

          if (response1080p.ok) {
            const data1080p = await response1080p.json()
            streamToken1080p = data1080p.token
          }

          if (video.approved) {
            const responseOriginal = await apiFetch(`/api/admin/video-token?videoId=${video.id}&projectId=${id}&quality=original&sessionId=${sessionId}`)
            if (responseOriginal.ok) {
              const dataOriginal = await responseOriginal.json()
              downloadToken = dataOriginal.token
              streamToken720p = streamToken720p || dataOriginal.token
              streamToken1080p = streamToken1080p || dataOriginal.token
            }
          }

          let thumbnailUrl = null
          if (video.thumbnailPath) {
            const responseThumbnail = await apiFetch(`/api/admin/video-token?videoId=${video.id}&projectId=${id}&quality=thumbnail&sessionId=${sessionId}`)
            if (responseThumbnail.ok) {
              const dataThumbnail = await responseThumbnail.json()
              thumbnailUrl = `/api/content/${dataThumbnail.token}`
            }
          }

          const tokenized = {
            ...video,
            streamUrl720p: streamToken720p ? `/api/content/${streamToken720p}` : '',
            streamUrl1080p: streamToken1080p ? `/api/content/${streamToken1080p}` : '',
            downloadUrl: downloadToken ? `/api/content/${downloadToken}?download=true` : null,
            thumbnailUrl,
          }

          tokenCacheRef.current.set(video.id, tokenized)
          return tokenized
        } catch (error) {
          return video
        }
      })
    )
  }

  // Load project data, settings, and admin user
  useEffect(() => {
    let isMounted = true

    async function loadProject() {
      if (!id) {
        setLoading(false)
        return
      }
      try {
        // Fetch project, settings, and current user in parallel
        const [projectResponse, userResponse, settingsResponse] = await Promise.all([
          apiFetch(`/api/projects/${id}`),
          apiFetch('/api/auth/session'),
          apiFetch('/api/settings'),
        ])

        if (!isMounted) return

        if (projectResponse.ok) {
          const projectData = await projectResponse.json()

          if (userResponse.ok) {
            const userData = await userResponse.json()
            setAdminUser(userData.user)
          }

          if (settingsResponse.ok) {
            const settingsData = await settingsResponse.json()
            setCompanyName(settingsData.companyName || 'Studio')
          } else {
            setCompanyName(projectData.companyName || 'Studio')
          }

          if (isMounted) {
            const transformedData = transformProjectData(projectData)
            setProject(transformedData)

            // Use project/company fallback for studio name and preview quality
            setDefaultQuality(projectData.previewResolution || '720p')

            if (!projectData.hideFeedback) {
              fetchComments()
            }
          }
        }
      } catch (error) {
        // Silent fail
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadProject()

    return () => {
      isMounted = false
    }
  }, [id])

  // Listen for comment updates (post, delete, etc.)
  useEffect(() => {
    const handleCommentPosted = (e: CustomEvent) => {
      // Use the comments data from the event if available, otherwise refetch
      if (e.detail?.comments) {
        setComments(e.detail.comments)
      } else {
        fetchComments()
      }
    }

    const handleCommentDeleted = () => {
      fetchComments()
    }

    window.addEventListener('commentPosted', handleCommentPosted as EventListener)
    window.addEventListener('commentDeleted', handleCommentDeleted)

    return () => {
      window.removeEventListener('commentPosted', handleCommentPosted as EventListener)
      window.removeEventListener('commentDeleted', handleCommentDeleted)
    }
  }, [id])

  // Set active video when project loads, handling URL parameters
  useEffect(() => {
    if (project?.videosByName) {
      const videoNames = Object.keys(project.videosByName)
      if (videoNames.length === 0) return

      if (!activeVideoName) {
        let videoNameToUse: string | null = null

        if (urlVideoName && project.videosByName[urlVideoName]) {
          videoNameToUse = urlVideoName
        } else {
          const savedVideoName = sessionStorage.getItem('approvedVideoName')
          if (savedVideoName) {
            sessionStorage.removeItem('approvedVideoName')
            if (project.videosByName[savedVideoName]) {
              videoNameToUse = savedVideoName
            }
          }
        }

        if (!videoNameToUse) {
          const sortedVideoNames = videoNames.sort((nameA, nameB) => {
            const hasApprovedA = project.videosByName[nameA].some((v: any) => v.approved)
            const hasApprovedB = project.videosByName[nameB].some((v: any) => v.approved)

            if (hasApprovedA !== hasApprovedB) {
              return hasApprovedA ? 1 : -1
            }
            return 0
          })
          videoNameToUse = sortedVideoNames[0]
        }

        setActiveVideoName(videoNameToUse)

        const videos = project.videosByName[videoNameToUse]
        setActiveVideosRaw(videos)

        if (urlVersion !== null && videos) {
          const targetIndex = videos.findIndex((v: any) => v.version === urlVersion)
          if (targetIndex !== -1) {
            setInitialVideoIndex(targetIndex)
          }
        }

        if (urlTimestamp !== null) {
          setInitialSeekTime(urlTimestamp)
        }
      } else {
        const videos = project.videosByName[activeVideoName]
        if (videos) {
          setActiveVideosRaw(videos)
        }
      }
    }
  }, [project, activeVideoName, urlVideoName, urlVersion, urlTimestamp])

  // Tokenize active videos lazily
  useEffect(() => {
    let isMounted = true

    async function loadTokens() {
      if (!activeVideosRaw || activeVideosRaw.length === 0) {
        setTokensLoading(false)
        return
      }
      setTokensLoading(true)
      const tokenized = await fetchTokensForVideos(activeVideosRaw)
      if (isMounted) {
        setActiveVideos(tokenized)
      }
      setTokensLoading(false)
    }

    loadTokens()

    return () => {
      isMounted = false
    }
  }, [activeVideosRaw])

  // Handle video selection (identical to public share)
  const handleVideoSelect = (videoName: string) => {
    setActiveVideoName(videoName)
    setActiveVideosRaw(project.videosByName[videoName])
  }

  // Show loading state while project loads
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // Show project not found
  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">Project not found</p>
            <Link href="/admin/projects">
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Projects
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Filter to READY videos first (identical to public share)
  let readyVideos = activeVideos.filter((v: any) => v.status === 'READY')

  // If any video is approved, show ONLY approved videos (for both admin and client)
  const hasApprovedVideo = readyVideos.some((v: any) => v.approved)
  if (hasApprovedVideo) {
    readyVideos = readyVideos.filter((v: any) => v.approved)
  }

  const hasMultipleVideos = project.videosByName && Object.keys(project.videosByName).length > 1

  // Filter comments to only show comments for active videos (identical to public share)
  const activeVideoIds = new Set(activeVideos.map((v: any) => v.id))
  const filteredComments = comments.filter((comment: any) => {
    // Show general comments (no videoId) or comments for active videos
    return !comment.videoId || activeVideoIds.has(comment.videoId)
  })

  const projectUrl = `/admin/projects/${id}`

  const clientDisplayName = (() => {
    const primaryRecipient = project.recipients?.find((r: any) => r.isPrimary) || project.recipients?.[0]
    return project.companyName || primaryRecipient?.name || primaryRecipient?.email || 'Client'
  })()

  return (
    <div className="h-screen bg-background flex flex-col lg:flex-row overflow-hidden">
      {/* Video Sidebar */}
      {project.videosByName && hasMultipleVideos && (
        <VideoSidebar
          videosByName={project.videosByName}
          activeVideoName={activeVideoName}
          onVideoSelect={handleVideoSelect}
          className="w-64 flex-shrink-0"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <div className="max-w-screen-2xl mx-auto w-full px-3 sm:px-4 lg:px-6 py-3 sm:py-6 flex-1 min-h-0 flex flex-col">
          {/* Header */}
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <Button
              variant="ghost"
              size="default"
              className="px-3"
              onClick={() => router.push(projectUrl)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Back to Project</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">
                {project.title}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Share View
              </p>
            </div>
          </div>

          {/* Main Content */}
            {readyVideos.length === 0 ? (
              <Card className="bg-card border-border rounded-lg">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    {tokensLoading ? 'Loading video...' : 'No videos are ready for review yet. Please check back later.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
            <div className={`flex-1 min-h-0 ${project.hideFeedback ? 'flex flex-col w-full' : 'grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3'}`}>
              <div className={project.hideFeedback ? 'flex-1 min-h-0 flex flex-col' : 'lg:col-span-2'}>
                <VideoPlayer
                  videos={readyVideos}
                  projectId={project.id}
                  projectStatus={project.status}
                  defaultQuality={defaultQuality}
                  projectTitle={project.title}
                  projectDescription={project.description}
                  clientName={project.clientName}
                  isPasswordProtected={!!project.sharePassword}
                  watermarkEnabled={project.watermarkEnabled}
                  activeVideoName={activeVideoName}
                  initialSeekTime={initialSeekTime}
                  initialVideoIndex={initialVideoIndex}
                  isAdmin={true}
                  isGuest={false}
                  allowAssetDownload={project.allowAssetDownload}
                  shareToken={null}
                  onApprove={undefined}
                  hideDownloadButton={true}
                />
              </div>

              {!project.hideFeedback && (
                <div className="lg:sticky lg:top-6 lg:self-start">
                  <CommentSection
                    projectId={project.id}
                    projectSlug={project.slug}
                    comments={filteredComments}
                    clientName={clientDisplayName}
                    clientEmail={project.recipients?.[0]?.email}
                    isApproved={project.status === 'APPROVED' || project.status === 'SHARE_ONLY'}
                    restrictToLatestVersion={project.restrictCommentsToLatestVersion}
                    videos={readyVideos}
                    isAdminView={true}
                    companyName={companyName}
                    clientCompanyName={project.companyName}
                    smtpConfigured={project.smtpConfigured}
                    isPasswordProtected={!!project.sharePassword}
                    adminUser={adminUser}
                    recipients={project.recipients || []}
                    shareToken={null}
                    showShortcutsButton={true}
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
