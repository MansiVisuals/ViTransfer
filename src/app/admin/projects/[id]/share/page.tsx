'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import VideoPlayer from '@/components/VideoPlayer'
import CommentSection from '@/components/CommentSection'
import ThumbnailGrid from '@/components/ThumbnailGrid'
import ThumbnailReel from '@/components/ThumbnailReel'
import PhotoThumbnailReel from '@/components/PhotoThumbnailReel'
import PhotoCommentOverlay from '@/components/PhotoCommentOverlay'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, CheckCircle2, Image as ImageIcon, Download } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import ThemeToggle from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

export default function AdminSharePage() {
  const t = useTranslations('projects')
  const tc = useTranslations('common')
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const id = params?.id as string

  // Parse URL parameters for video seeking (same as public share page)
  const urlTimestamp = searchParams?.get('t') ? parseFloat(searchParams.get('t')!) : null
  const urlVideoName = searchParams?.get('video') || null
  const urlVersion = searchParams?.get('version') ? parseInt(searchParams.get('version')!, 10) : null
  const urlFocusCommentId = searchParams?.get('comment') || null

  const [focusCommentId, setFocusCommentId] = useState<string | null>(urlFocusCommentId)
  const [project, setProject] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [_commentsLoading, setCommentsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [_companyName, setCompanyName] = useState('Studio')
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

  // Photo state
  const [activePhotoId, setActivePhotoId] = useState<string>('')
  const [photoContentTokens, setPhotoContentTokens] = useState<Record<string, string>>({})
  const [focusPinId, setFocusPinId] = useState<string | null>(null)

  const urlPhotoId = searchParams?.get('photo') || null
  const isPhotoProject = project?.type === 'PHOTO'

  // Fetch comments separately for security (same pattern as public share)
  const fetchComments = useCallback(async () => {
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
  }, [id])

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

  const fetchTokensForVideos = useCallback(async (videos: any[]) => {
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
  }, [id])

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
  }, [id, fetchComments])

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
  }, [fetchComments])

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
  }, [activeVideosRaw, fetchTokensForVideos])

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

  // Determine initial view state based on URL params (same behavior as public share)
  useEffect(() => {
    if (!project) return

    // PHOTO project: check for photo URL param
    if (project.type === 'PHOTO') {
      if (urlPhotoId && project.photos?.some((p: any) => p.id === urlPhotoId)) {
        setViewState('player')
        setActivePhotoId(urlPhotoId)
      } else {
        setViewState('grid')
      }
      return
    }

    // VIDEO project
    if (!project.videosByName) return
    if (urlVideoName && project.videosByName[urlVideoName]) {
      setViewState('player')
      return
    }

    setViewState('grid')
  }, [project, urlVideoName, urlPhotoId])

  // Fetch content tokens for photos
  useEffect(() => {
    if (!project?.photos?.length || !id) return

    const readyPhotos = project.photos.filter((p: any) => p.status === 'READY')
    if (readyPhotos.length === 0) return

    const missingIds = readyPhotos
      .map((p: any) => p.id)
      .filter((pid: string) => !photoContentTokens[pid])

    if (missingIds.length === 0) return

    let cancelled = false

    async function fetchPhotoTokens() {
      const newTokens: Record<string, string> = {}
      await Promise.all(
        missingIds.map(async (photoId: string) => {
          try {
            const res = await apiFetch(
              `/api/admin/photo-token?photoId=${photoId}&projectId=${id}&sessionId=${sessionIdRef.current}`
            )
            if (res.ok) {
              const data = await res.json()
              if (data.token) {
                newTokens[photoId] = `/api/content/${data.token}`
              }
            }
          } catch {
            // Token fetch failed
          }
        })
      )
      if (!cancelled && Object.keys(newTokens).length > 0) {
        setPhotoContentTokens(prev => ({ ...prev, ...newTokens }))
      }
    }

    fetchPhotoTokens()
    return () => { cancelled = true }
  }, [project?.photos, id, photoContentTokens])

  // Set initial active photo for PHOTO projects
  useEffect(() => {
    if (!project?.photos?.length || project.type !== 'PHOTO') return
    if (activePhotoId) return

    const readyPhotos = [...project.photos]
      .filter((p: any) => p.status === 'READY')
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)

    // Prefer unapproved first
    const unapproved = readyPhotos.filter((p: any) => !p.approved)
    const firstPhoto = unapproved[0] || readyPhotos[0]
    if (firstPhoto) {
      setActivePhotoId(firstPhoto.id)
    }
  }, [project?.photos, project?.type, activePhotoId])

  // Handle video selection
  const handleVideoSelect = useCallback((videoName: string) => {
    setActiveVideoName(videoName)
    setActiveVideosRaw(project.videosByName[videoName])
    setViewState('player')

    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('video', videoName)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [project?.videosByName, searchParams, pathname, router])

  // Handle photo selection
  const handlePhotoSelect = useCallback((photoId: string) => {
    setActivePhotoId(photoId)
    setViewState('player')

    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('photo', photoId)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [searchParams, pathname, router])

  // Handle back to grid
  const handleBackToGrid = useCallback(() => {
    setViewState('grid')

    const params = new URLSearchParams(searchParams?.toString() || '')
    params.delete('video')
    params.delete('photo')
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
    router.replace(newUrl || '', { scroll: false })
  }, [searchParams, pathname, router])

  const projectUrl = `/admin/projects/${id}`

  // Show loading state
  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{tc('loading')}</p>
      </div>
    )
  }

  // Show project not found
  if (!project) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center p-4">
        <Card className="bg-card">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">{t('projectNotFound')}</p>
            <Link href="/admin/projects">
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('backToProjects')}
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

  // Filter comments for video or photo context
  const activeVideoIds = new Set(activeVideos.map((v: any) => v.id))
  const filteredComments = isPhotoProject
    ? comments.filter((comment: any) => !comment.photoId || comment.photoId === activePhotoId)
    : comments.filter((comment: any) => !comment.videoId || activeVideoIds.has(comment.videoId))

  // Pin comments for the active photo (comments with pin coordinates)
  const pinComments = isPhotoProject
    ? filteredComments.filter((c: any) => c.photoId === activePhotoId && c.pinX != null && c.pinY != null)
    : []

  const clientDisplayName = (() => {
    const primaryRecipient = project.recipients?.find((r: any) => r.isPrimary) || project.recipients?.[0]
    return project.companyName || primaryRecipient?.name || primaryRecipient?.email || t('client')
  })()

  const showCommentPanel = !project.hideFeedback && !hideComments

  // Ready photos for photo projects
  const readyPhotos = isPhotoProject
    ? [...(project.photos || [])].filter((p: any) => p.status === 'READY').sort((a: any, b: any) => a.sortOrder - b.sortOrder)
    : []
  const activePhoto = readyPhotos.find((p: any) => p.id === activePhotoId)
  const activePhotoUrl = activePhotoId ? photoContentTokens[activePhotoId] : null

  // ─── Grid view ───
  if (viewState === 'grid') {
    return (
      <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
        {/* Grid view toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-background/95 backdrop-blur-sm z-20 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(projectUrl)}
            title={t('backToProject')}
          >
            <ArrowLeft className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('backToProject')}</span>
          </Button>
          <ThemeToggle />
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
            {isPhotoProject ? (
              /* ── Photo grid ── */
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="text-center mb-8 sm:mb-12 pt-4">
                  {clientDisplayName && (
                    <p className="text-xs sm:text-sm text-muted-foreground mb-2">{clientDisplayName}</p>
                  )}
                  {project.title && (
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-foreground mb-4">{project.title}</h1>
                  )}
                  {project.description && (
                    <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto mb-6">{project.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">Select a photo to begin review</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:gap-6 xl:grid-cols-4 2xl:grid-cols-5">
                  {readyPhotos.map((photo: any) => {
                    const url = photoContentTokens[photo.id]
                    return (
                      <button
                        key={photo.id}
                        onClick={() => handlePhotoSelect(photo.id)}
                        className={cn(
                          'group relative rounded-lg overflow-hidden',
                          'bg-card border border-border',
                          'hover:border-primary/50 hover:shadow-elevation-lg',
                          'transition-all duration-200',
                          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background'
                        )}
                      >
                        <div className="aspect-square relative bg-muted">
                          {url ? (
                            <img src={url} alt={photo.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" draggable={false} />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <ImageIcon className="w-8 h-8 sm:w-12 sm:h-12 text-muted-foreground/50" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200" />
                          {photo.approved && (
                            <div className="absolute top-2 right-2 bg-success text-success-foreground rounded-full p-1">
                              <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </div>
                          )}
                        </div>
                        <div className="p-3 sm:p-4">
                          <p className="text-sm font-medium text-foreground truncate text-left">{photo.name}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* ── Video grid ── */
              <ThumbnailGrid
                videosByName={project.videosByName}
                thumbnailsByName={thumbnailsByName}
                thumbnailsLoading={thumbnailsLoading}
                onVideoSelect={handleVideoSelect}
                projectTitle={project.title}
                projectDescription={project.description}
                clientName={clientDisplayName}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Photo player view ───
  if (isPhotoProject) {
    return (
      <div className="min-h-screen lg:fixed lg:inset-0 bg-background flex flex-col lg:overflow-hidden">
        <PhotoThumbnailReel
          photos={readyPhotos}
          activePhotoId={activePhotoId}
          onPhotoSelect={handlePhotoSelect}
          contentTokens={photoContentTokens}
          onBackToGrid={handleBackToGrid}
          showBackButton={true}
          showLanguageToggle={false}
          showCommentToggle={!project.hideFeedback}
          isCommentPanelVisible={!hideComments}
          onToggleCommentPanel={() => setHideComments(!hideComments)}
        />

        <div className="xl:flex-1 xl:min-h-0 flex flex-col xl:flex-row p-2 sm:p-3 gap-2 sm:gap-3">
          {!activePhoto ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <Card className="bg-card">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No photos ready for review</p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <>
              {/* Photo viewer with pin overlay */}
              <div className={`xl:h-full xl:min-h-0 xl:flex-1 min-w-0 flex flex-col ${showCommentPanel ? 'xl:flex-[2] 2xl:flex-[2.5]' : ''}`}>
                <div className="flex-1 min-h-0 rounded-xl overflow-hidden bg-black flex items-center justify-center relative">
                  <PhotoCommentOverlay
                    comments={pinComments}
                    onPinPlace={(pinX, pinY) => {
                      // Pin placement triggers comment creation — CommentSection handles this
                      // Dispatch event so CommentSection can pick up coordinates
                      window.dispatchEvent(new CustomEvent('photoPinPlace', { detail: { photoId: activePhotoId, pinX, pinY } }))
                    }}
                    onPinClick={(commentId) => setFocusPinId(commentId)}
                    activePinId={focusPinId}
                    canPlace={!project.hideFeedback}
                    className="w-full h-full flex items-center justify-center"
                  >
                    {activePhotoUrl ? (
                      <img
                        src={activePhotoUrl}
                        alt={activePhoto.name}
                        className="max-w-full max-h-full object-contain"
                        draggable={false}
                      />
                    ) : (
                      <div className="text-white/40 text-sm">Loading...</div>
                    )}
                  </PhotoCommentOverlay>

                  {/* Photo info + download bar */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-3 flex items-end justify-between">
                    <div className="text-white text-sm">
                      <span className="font-medium">{activePhoto.name}</span>
                      {activePhoto.approved && (
                        <span className="ml-2 inline-flex items-center gap-1 text-green-400 text-xs">
                          <CheckCircle2 className="w-3 h-3" /> Approved
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-white hover:bg-white/10"
                      onClick={async () => {
                        try {
                          const res = await apiFetch(`/api/photos/${activePhoto.id}/download-token`, { method: 'POST' })
                          if (res.ok) {
                            const data = await res.json()
                            window.open(data.url, '_blank')
                          }
                        } catch {
                          // Download failed
                        }
                      }}
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Comments panel */}
              {showCommentPanel && (
                <div className="max-h-[100vh] xl:shrink xl:flex-1 xl:max-w-[30%] 2xl:max-w-[25%] xl:min-w-[280px] flex flex-col xl:max-h-full xl:h-full overflow-hidden rounded-xl bg-card">
                  <CommentSection
                    projectId={project.id}
                    projectSlug={project.slug}
                    comments={filteredComments}
                    focusCommentId={focusPinId}
                    clientName={clientDisplayName}
                    clientEmail={project.recipients?.[0]?.email}
                    isApproved={project.status === 'APPROVED' || project.status === 'SHARE_ONLY'}
                    restrictToLatestVersion={false}
                    videos={[]}
                    isAdminView={true}
                    smtpConfigured={project.smtpConfigured}
                    isPasswordProtected={!!project.sharePassword}
                    adminUser={adminUser}
                    recipients={project.recipients || []}
                    shareToken={null}
                    showShortcutsButton={false}
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

  // ─── Video player view ───
  return (
    <div className="min-h-screen lg:fixed lg:inset-0 bg-background flex flex-col lg:overflow-hidden">
      {/* Thumbnail Reel - always visible, collapsible */}
      <ThumbnailReel
        videosByName={project.videosByName}
        thumbnailsByName={thumbnailsByName}
        activeVideoName={activeVideoName}
        onVideoSelect={handleVideoSelect}
        onBackToGrid={handleBackToGrid}
        showBackButton={true}
        showLanguageToggle={false}
        showCommentToggle={!project.hideFeedback}
        isCommentPanelVisible={!hideComments}
        onToggleCommentPanel={() => setHideComments(!hideComments)}
      />
      {/* Main Content Area */}
      <div className="xl:flex-1 xl:min-h-0 flex flex-col xl:flex-row p-2 sm:p-3 gap-2 sm:gap-3">
        {readyVideos.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <Card className="bg-card">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  {tokensLoading ? t('loadingVideo') : t('noVideosReadyForReview')}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            {/* Video Player */}
            <div className={`xl:h-full xl:min-h-0 xl:flex-1 min-w-0 flex flex-col ${showCommentPanel ? 'xl:flex-[2] 2xl:flex-[2.5]' : ''}`}>
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
              <div className="max-h-[100vh] xl:shrink xl:flex-1 xl:max-w-[30%] 2xl:max-w-[25%] xl:min-w-[280px] flex flex-col xl:max-h-full xl:h-full overflow-hidden rounded-xl bg-card">
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
