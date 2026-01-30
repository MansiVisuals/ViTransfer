'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import VideoPlayer from '@/components/VideoPlayer'
import CommentSection from '@/components/CommentSection'
import ThumbnailGrid from '@/components/ThumbnailGrid'
import ThumbnailReel from '@/components/ThumbnailReel'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import ThemeToggle from '@/components/ThemeToggle'

export default function AdminSharePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const id = params?.id as string

  // Parse URL parameters for video seeking (same as public share page)
  const urlTimestamp = searchParams?.get('t') ? parseInt(searchParams.get('t')!, 10) : null
  const urlVideoName = searchParams?.get('video') || null
  const urlVersion = searchParams?.get('version') ? parseInt(searchParams.get('version')!, 10) : null
  const urlFocusCommentId = searchParams?.get('comment') || null

  const [focusCommentId, setFocusCommentId] = useState<string | null>(urlFocusCommentId)
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
  const [hideComments, setHideComments] = useState(false)
  const [viewState, setViewState] = useState<'grid' | 'player'>('grid')
  const [thumbnailsByName, setThumbnailsByName] = useState<Map<string, string>>(new Map())
  const [thumbnailsLoading, setThumbnailsLoading] = useState(true)
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

  // Fetch thumbnails for all video groups
  useEffect(() => {
    let isMounted = true
    const sessionId = sessionIdRef.current

    async function fetchThumbnails() {
      if (!project?.videosByName || !id) {
        return
      }

      setThumbnailsLoading(true)
      const newThumbnails = new Map<string, string>()

      try {
        await Promise.all(
          Object.entries(project.videosByName as Record<string, any[]>).map(async ([name, videos]) => {
            const videoWithThumb = videos.find((v: any) => v.thumbnailPath)
            if (videoWithThumb) {
              const responseThumbnail = await apiFetch(
                `/api/admin/video-token?videoId=${videoWithThumb.id}&projectId=${id}&quality=thumbnail&sessionId=${sessionId}`
              )
              if (responseThumbnail.ok && isMounted) {
                const dataThumbnail = await responseThumbnail.json()
                newThumbnails.set(name, `/api/content/${dataThumbnail.token}`)
              }
            }
          })
        )

        if (isMounted) {
          setThumbnailsByName(newThumbnails)
        }
      } catch (error) {
        // Failed to load thumbnails
      } finally {
        if (isMounted) {
          setThumbnailsLoading(false)
        }
      }
    }

    fetchThumbnails()

    return () => {
      isMounted = false
    }
  }, [project?.videosByName, id])

  // Determine initial view state based on video count and URL params
  useEffect(() => {
    if (!project?.videosByName) return

    const videoNames = Object.keys(project.videosByName)
    const hasMultiple = videoNames.length > 1

    if (!hasMultiple) {
      setViewState('player')
      return
    }

    if (urlVideoName && project.videosByName[urlVideoName]) {
      setViewState('player')
      return
    }

    setViewState('grid')
  }, [project?.videosByName, urlVideoName])

  // Handle video selection
  const handleVideoSelect = useCallback((videoName: string) => {
    setActiveVideoName(videoName)
    setActiveVideosRaw(project.videosByName[videoName])
    setViewState('player')

    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('video', videoName)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [project?.videosByName, searchParams, pathname, router])

  // Handle back to grid
  const handleBackToGrid = useCallback(() => {
    setViewState('grid')

    const params = new URLSearchParams(searchParams?.toString() || '')
    params.delete('video')
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
    router.replace(newUrl || '', { scroll: false })
  }, [searchParams, pathname, router])

  const projectUrl = `/admin/projects/${id}`

  // Show loading state
  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // Show project not found
  if (!project) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center p-4">
        <Card className="bg-card">
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

  // Filter to READY videos
  let readyVideos = activeVideos.filter((v: any) => v.status === 'READY')

  const hasApprovedVideo = readyVideos.some((v: any) => v.approved)
  if (hasApprovedVideo) {
    readyVideos = readyVideos.filter((v: any) => v.approved)
  }

  const hasMultipleVideos = project.videosByName && Object.keys(project.videosByName).length > 1

  const activeVideoIds = new Set(activeVideos.map((v: any) => v.id))
  const filteredComments = comments.filter((comment: any) => {
    return !comment.videoId || activeVideoIds.has(comment.videoId)
  })

  const clientDisplayName = (() => {
    const primaryRecipient = project.recipients?.find((r: any) => r.isPrimary) || project.recipients?.[0]
    return project.companyName || primaryRecipient?.name || primaryRecipient?.email || 'Client'
  })()

  const showCommentPanel = !project.hideFeedback && !hideComments

  // Show thumbnail grid for multi-video projects when in grid view
  if (viewState === 'grid' && hasMultipleVideos) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
        {/* Theme toggle */}
        <div className="absolute top-3 right-3 z-20">
          <ThemeToggle />
        </div>
        {/* Back button */}
        <div className="absolute top-3 left-3 z-20">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(projectUrl)}
            className="bg-card/95 backdrop-blur-sm"
            title="Back to project"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Back to Project</span>
            <span className="sm:hidden">Back</span>
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 pt-16">
            <ThumbnailGrid
              videosByName={project.videosByName}
              thumbnailsByName={thumbnailsByName}
              thumbnailsLoading={thumbnailsLoading}
              onVideoSelect={handleVideoSelect}
              projectTitle={project.title}
              projectDescription={project.description}
              clientName={clientDisplayName}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      {/* Thumbnail Reel for multi-video projects */}
      {hasMultipleVideos && (
        <ThumbnailReel
          videosByName={project.videosByName}
          thumbnailsByName={thumbnailsByName}
          activeVideoName={activeVideoName}
          onVideoSelect={handleVideoSelect}
          onBackToGrid={handleBackToGrid}
          showBackButton={true}
          showCommentToggle={!project.hideFeedback}
          isCommentPanelVisible={!hideComments}
          onToggleCommentPanel={() => setHideComments(!hideComments)}
        />
      )}

      {/* Theme toggle for single-video projects */}
      {!hasMultipleVideos && (
        <div className="absolute top-3 right-3 z-20">
          <ThemeToggle />
        </div>
      )}

      {/* Back button for single-video projects */}
      {!hasMultipleVideos && (
        <div className="absolute top-3 left-3 z-20">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(projectUrl)}
            className="bg-card/95 backdrop-blur-sm"
            title="Back to project"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline ml-2">Back</span>
          </Button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row p-2 sm:p-3 gap-2 sm:gap-3">
        {readyVideos.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <Card className="bg-card">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  {tokensLoading ? 'Loading video...' : 'No videos are ready for review yet.'}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            {/* Video Player */}
            <div className={`flex-1 min-h-0 min-w-0 flex flex-col rounded-xl overflow-hidden ${showCommentPanel ? 'lg:flex-[2] xl:flex-[2.5]' : ''}`}>
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
                comments={!project.hideFeedback ? filteredComments : []}
                timestampDisplayMode={project.timestampDisplay || 'TIMECODE'}
                onCommentFocus={(commentId) => setFocusCommentId(commentId)}
                fillContainer={true}
              />
            </div>

            {/* Comments Section */}
            {showCommentPanel && (
              <div className="shrink-0 lg:shrink lg:flex-1 lg:max-w-[30%] xl:max-w-[25%] lg:min-w-[280px] flex flex-col max-h-[35vh] lg:max-h-full lg:h-full overflow-hidden rounded-xl bg-card">
                <CommentSection
                  projectId={project.id}
                  projectSlug={project.slug}
                  comments={filteredComments}
                  focusCommentId={focusCommentId}
                  clientName={clientDisplayName}
                  clientEmail={project.recipients?.[0]?.email}
                  isApproved={project.status === 'APPROVED' || project.status === 'SHARE_ONLY'}
                  restrictToLatestVersion={project.restrictCommentsToLatestVersion}
                  videos={readyVideos}
                  isAdminView={true}
                  smtpConfigured={project.smtpConfigured}
                  isPasswordProtected={!!project.sharePassword}
                  adminUser={adminUser}
                  recipients={project.recipients || []}
                  shareToken={null}
                  showShortcutsButton={true}
                  timestampDisplayMode={project.timestampDisplay || 'TIMECODE'}
                  mobileCollapsible={true}
                  initialMobileCollapsed={true}
                  onToggleVisibility={() => setHideComments(!hideComments)}
                  showToggleButton={false}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
