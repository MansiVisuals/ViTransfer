'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams, usePathname, useRouter } from 'next/navigation'
import VideoPlayer from '@/components/VideoPlayer'
import CommentSection from '@/components/CommentSection'
import ThumbnailGrid from '@/components/ThumbnailGrid'
import ThumbnailReel from '@/components/ThumbnailReel'
import { OTPInput } from '@/components/OTPInput'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Button } from '@/components/ui/button'
import { Lock, Check, Mail, KeyRound, Download, Loader2, CheckCircle2, Image as ImageIcon } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { loadShareToken, saveShareToken } from '@/lib/share-token-store'
import ThemeToggle from '@/components/ThemeToggle'
import LanguageToggle from '@/components/LanguageToggle'
import { cn } from '@/lib/utils'
import { ShareTutorial } from '@/components/ShareTutorial'
import PrivacyBanner, { PRIVACY_STORAGE_KEY } from '@/components/PrivacyBanner'
import ReverseShareUploadPanel from '@/components/ReverseShareUploadPanel'
import PhotoThumbnailReel from '@/components/PhotoThumbnailReel'
import PhotoCommentOverlay from '@/components/PhotoCommentOverlay'

interface SharePageClientProps {
  token: string
}

export default function SharePageClient({ token }: SharePageClientProps) {
  const t = useTranslations('share')
  const tc = useTranslations('common')
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  // Parse URL parameters for video seeking
  const urlTimestamp = searchParams?.get('t') ? parseFloat(searchParams.get('t')!) : null
  const urlVideoName = searchParams?.get('video') || null
  const urlVersion = searchParams?.get('version') ? parseInt(searchParams.get('version')!, 10) : null
  const urlFocusCommentId = searchParams?.get('comment') || null

  const [focusCommentId, setFocusCommentId] = useState<string | null>(urlFocusCommentId)
  const [isPasswordProtected, setIsPasswordProtected] = useState<boolean | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isGuest, setIsGuest] = useState(false)
  const [authMode, setAuthMode] = useState<string>('PASSWORD')
  const [guestMode, setGuestMode] = useState(false)
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [authenticatedEmail, setAuthenticatedEmail] = useState<string | null>(null) // Track OTP-authenticated email
  const [authenticatedName, setAuthenticatedName] = useState<string | null>(null) // Track OTP-authenticated name
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [error, setError] = useState('')
  const [project, setProject] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [_commentsLoading, setCommentsLoading] = useState(false)
  const [_companyName, setCompanyName] = useState('Studio')
  const [defaultQuality, setDefaultQuality] = useState<'720p' | '1080p'>('720p')
  const [activeVideoName, setActiveVideoName] = useState<string>('')
  const [activeVideos, setActiveVideos] = useState<any[]>([])
  const [activeVideosRaw, setActiveVideosRaw] = useState<any[]>([])
  const [tokensLoading, setTokensLoading] = useState(false)
  const [initialSeekTime, setInitialSeekTime] = useState<number | null>(null)
  const [initialVideoIndex, setInitialVideoIndex] = useState<number>(0)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [hideComments, setHideComments] = useState(false)
  const [viewState, setViewState] = useState<'grid' | 'player'>('grid')
  const [thumbnailsByName, setThumbnailsByName] = useState<Map<string, string>>(new Map())
  const [thumbnailsLoading, setThumbnailsLoading] = useState(true)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [downloadingAllPhotos, setDownloadingAllPhotos] = useState(false)
  const [photoContentTokens, setPhotoContentTokens] = useState<Record<string, string>>({})
  const [activePhotoId, setActivePhotoId] = useState<string>('')
  const [focusPinId, setFocusPinId] = useState<string | null>(null)
  const storageKey = token || ''
  const tokenCacheRef = useRef<Map<string, any>>(new Map())

  /** Read GDPR analytics consent from localStorage for inclusion in auth request headers */
  const getConsentHeader = (): Record<string, string> => {
    try {
      const stored = localStorage.getItem(PRIVACY_STORAGE_KEY)
      if (stored === 'true') return { 'X-Analytics-Consent': 'true' }
      if (stored === 'declined') return { 'X-Analytics-Consent': 'false' }
    } catch { /* ignore */ }
    return {}
  }

  // Load stored token once (persist across refresh)
  useEffect(() => {
    if (!storageKey) return
    const stored = loadShareToken(storageKey)
    if (stored) {
      setShareToken(stored)
    }
  }, [storageKey])

  // Restore authenticatedEmail from server-provided authenticatedRecipientId (for OTP users)
  // Server extracts recipientId from token - client never decodes token
  useEffect(() => {
    if (!project?.authenticatedRecipientId || !project?.recipients?.length) return
    // Match server-provided recipientId with recipients to get email/name
    const recipient = project.recipients.find((r: any) => r.id === project.authenticatedRecipientId)
    if (recipient?.email) {
      if (!authenticatedEmail) setAuthenticatedEmail(recipient.email)
      if (!authenticatedName && recipient.name) setAuthenticatedName(recipient.name)
    }
  }, [project?.authenticatedRecipientId, project?.recipients, authenticatedEmail, authenticatedName])

  // Resolve authenticated name from recipients when we have email but no name
  useEffect(() => {
    if (!authenticatedEmail || authenticatedName || !project?.recipients?.length) return
    const recipient = project.recipients.find(
      (r: any) => r.email?.toLowerCase() === authenticatedEmail.toLowerCase()
    )
    if (recipient?.name) setAuthenticatedName(recipient.name)
  }, [authenticatedEmail, authenticatedName, project?.recipients])

  // Fetch comments separately for security
  const fetchComments = useCallback(async () => {
    if (!token || !shareToken) return

    setCommentsLoading(true)
    try {
      const response = await fetch(`/api/share/${token}/comments`, {
        headers: {
          Authorization: `Bearer ${shareToken}`
        }
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
  }, [token, shareToken])

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
  }, [fetchComments])

  // Fetch project data function (for refresh after approval)
  const fetchProjectData = async (tokenOverride?: string | null) => {
    try {
      const authToken = tokenOverride || shareToken
      const projectResponse = await fetch(`/api/share/${token}`, {
        headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), ...getConsentHeader() }
      })
      if (projectResponse.ok) {
        const projectData = await projectResponse.json()

        if (projectData.shareToken) {
          setShareToken(projectData.shareToken)
          saveShareToken(storageKey, projectData.shareToken)
        } else if (tokenOverride) {
          setShareToken(tokenOverride)
          saveShareToken(storageKey, tokenOverride)
        }
        setProject(projectData)

        // Clear token cache to force re-fetch of video tokens with updated approval status
        tokenCacheRef.current.clear()

        // Fetch comments after project loads (if not hidden)
        if (!projectData.hideFeedback) {
          fetchComments()
        }
      }
    } catch (error) {
      // Failed to load project data
    }
  }

  // Company name and default quality now loaded from project settings
  // This ensures they're only accessible after authentication

  // Load project data (handles auth check implicitly via API response)
  useEffect(() => {
    let isMounted = true

    async function loadProject() {
      try {
        const response = await fetch(`/api/share/${token}`, {
          headers: { ...(shareToken ? { Authorization: `Bearer ${shareToken}` } : {}), ...getConsentHeader() }
        })

        if (!isMounted) return

        if (response.status === 401) {
          saveShareToken(storageKey, null)
          const data = await response.json()
          if (data.authMode === 'NONE' && data.guestMode) {
            try {
              const guestResponse = await fetch(`/api/share/${token}/guest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getConsentHeader() },
              })
              if (guestResponse.ok) {
                const guestData = await guestResponse.json()
                if (guestData.shareToken) {
                  setShareToken(guestData.shareToken)
                  saveShareToken(storageKey, guestData.shareToken)
                  setIsGuest(true)
                  setIsAuthenticated(true)
                  await loadProject()
                  return
                }
              }
            } catch {
              // fall through
            }
          }

          setIsPasswordProtected(true)
          setIsAuthenticated(false)
          setAuthMode(data.authMode || 'PASSWORD')
          setGuestMode(data.guestMode || false)
          return
        }

        if (response.status === 403 || response.status === 404) {
          // Server already validated slug exists, this shouldn't happen
          // but handle gracefully by showing project not found
          return
        }

        if (response.ok) {
          const projectData = await response.json()
          if (projectData.shareToken) {
            setShareToken(projectData.shareToken)
            saveShareToken(storageKey, projectData.shareToken)
          }
          if (isMounted) {
            setProject(projectData)
            setIsPasswordProtected(!!projectData.recipients && projectData.recipients.length > 0)
            setIsAuthenticated(true)
            setIsGuest(projectData.isGuest || false)

            if (projectData.settings) {
              setCompanyName(projectData.settings.companyName || 'Studio')
              setDefaultQuality(projectData.settings.defaultPreviewResolution || '720p')
            }

            if (!projectData.hideFeedback) {
              fetchComments()
            }
          }
        }
      } catch (error) {
        // Silent fail
      }
    }

    loadProject()

    return () => {
      isMounted = false
    }
  }, [token, shareToken, storageKey, fetchComments])

  // Set active video when project loads, handling URL parameters
  useEffect(() => {
    if (project?.videosByName) {
      const videoNames = Object.keys(project.videosByName)
      if (videoNames.length === 0) return

      // Determine which video group should be active
      if (!activeVideoName) {
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
        setActiveVideosRaw(videos)

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
      } else {
        // Keep activeVideos in sync when project data refreshes (ensures updated approval status/thumbnails/tokens)
        const videos = project.videosByName[activeVideoName]
        if (videos) {
          setActiveVideosRaw(videos)
        }
      }
    }
  }, [project?.videosByName, activeVideoName, urlVideoName, urlVersion, urlTimestamp])

  const fetchVideoToken = useCallback(async (videoId: string, quality: string) => {
    if (!shareToken) return ''
    const response = await fetch(`/api/share/${token}/video-token?videoId=${videoId}&quality=${quality}`, {
      headers: {
        Authorization: `Bearer ${shareToken}`,
      }
    })
    if (!response.ok) return ''
    const data = await response.json()
    return data.token || ''
  }, [shareToken, token])

  const fetchTokensForVideos = useCallback(async (videos: any[]) => {
    if (!shareToken) return videos

    return Promise.all(
      videos.map(async (video: any) => {
        const cached = tokenCacheRef.current.get(video.id)
        if (cached) {
          return cached
        }

        try {
          let streamToken720p = ''
          let streamToken1080p = ''
          let downloadToken = null

          if (video.approved) {
            // Check if project uses preview for approved playback
            if (project?.usePreviewForApprovedPlayback) {
              // Use preview tokens for streaming, original for download
              const [token720, token1080, originalToken] = await Promise.all([
                fetchVideoToken(video.id, '720p'),
                fetchVideoToken(video.id, '1080p'),
                fetchVideoToken(video.id, 'original'),
              ])
              streamToken720p = token720
              streamToken1080p = token1080
              downloadToken = originalToken
            } else {
              // Default: original for everything
              const originalToken = await fetchVideoToken(video.id, 'original')
              streamToken720p = originalToken
              streamToken1080p = originalToken
              downloadToken = originalToken
            }
          } else {
            const [token720, token1080] = await Promise.all([
              fetchVideoToken(video.id, '720p'),
              fetchVideoToken(video.id, '1080p'),
            ])
            streamToken720p = token720
            streamToken1080p = token1080
          }

          let thumbnailUrl = null
          if (video.thumbnailPath) {
            const thumbToken = await fetchVideoToken(video.id, 'thumbnail')
            if (thumbToken) {
              thumbnailUrl = `/api/content/${thumbToken}`
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
  }, [shareToken, fetchVideoToken, project?.usePreviewForApprovedPlayback])

  useEffect(() => {
    let isMounted = true

    async function loadTokens() {
      if (!activeVideosRaw || activeVideosRaw.length === 0) {
        setTokensLoading(false)
        return
      }
      if (!shareToken) {
        setTokensLoading(true)
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
  }, [activeVideosRaw, shareToken, fetchTokensForVideos])

  // Fetch thumbnails for all video groups (for grid and reel display)
  useEffect(() => {
    let isMounted = true

    async function fetchThumbnails() {
      if (!project?.videosByName || !shareToken) {
        return
      }

      setThumbnailsLoading(true)
      const newThumbnails = new Map<string, string>()

      try {
        await Promise.all(
          Object.entries(project.videosByName as Record<string, any[]>).map(async ([name, videos]) => {
            // Find a video with a thumbnail
            const videoWithThumb = videos.find((v: any) => v.thumbnailPath)
            if (videoWithThumb) {
              const thumbToken = await fetchVideoToken(videoWithThumb.id, 'thumbnail')
              if (thumbToken && isMounted) {
                newThumbnails.set(name, `/api/content/${thumbToken}`)
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
  }, [project?.videosByName, shareToken, fetchVideoToken])

  // Fetch content tokens for photos (for gallery display)
  useEffect(() => {
    if (!project?.photos?.length || !shareToken) return

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
            const res = await fetch(`/api/share/${token}/photo-token?photoId=${photoId}`, {
              headers: { Authorization: `Bearer ${shareToken}` },
            })
            if (res.ok) {
              const data = await res.json()
              if (data.token) {
                newTokens[photoId] = `/api/content/${data.token}`
              }
            }
          } catch {
            // Token fetch failed for this photo
          }
        })
      )
      if (!cancelled && Object.keys(newTokens).length > 0) {
        setPhotoContentTokens(prev => ({ ...prev, ...newTokens }))
      }
    }

    fetchPhotoTokens()
    return () => { cancelled = true }
  }, [project?.photos, shareToken, token, photoContentTokens])

  // Determine initial view state based on URL params
  const urlPhotoId = searchParams?.get('photo') || null
  const isPhotoProject = project?.type === 'PHOTO'

  // Determine initial view state
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

  // Set initial active photo for PHOTO projects
  useEffect(() => {
    if (!project?.photos?.length || project.type !== 'PHOTO') return
    if (activePhotoId) return

    const readyPhotos = [...project.photos]
      .filter((p: any) => p.status === 'READY')
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)

    const unapproved = readyPhotos.filter((p: any) => !p.approved)
    const firstPhoto = unapproved[0] || readyPhotos[0]
    if (firstPhoto) {
      setActivePhotoId(firstPhoto.id)
    }
  }, [project?.photos, project?.type, activePhotoId])

  // Handle video selection - update URL so refresh preserves state
  const handleVideoSelect = useCallback((videoName: string) => {
    setActiveVideoName(videoName)
    setActiveVideosRaw(project.videosByName[videoName])
    setViewState('player')

    // Update URL with video parameter (preserves state on refresh)
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

  // Handle back to grid - remove video/photo param from URL
  const handleBackToGrid = useCallback(() => {
    setViewState('grid')

    const params = new URLSearchParams(searchParams?.toString() || '')
    params.delete('video')
    params.delete('photo')
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
    router.replace(newUrl || '', { scroll: false })
  }, [searchParams, pathname, router])

  const handleDownloadAll = useCallback(async () => {
    if (downloadingAll || !shareToken) return

    try {
      setDownloadingAll(true)

      const response = await fetch(`/api/share/${token}/download-all-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${shareToken}`,
        },
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Download failed')
      }

      const { url } = await response.json()

      const link = document.createElement('a')
      link.href = url
      link.download = ''
      link.rel = 'noopener'
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch {
      // Silently fail - user can retry
    } finally {
      setDownloadingAll(false)
    }
  }, [downloadingAll, shareToken, token])

  const handleDownloadAllPhotos = useCallback(async () => {
    if (downloadingAllPhotos || !shareToken) return

    try {
      setDownloadingAllPhotos(true)

      const response = await fetch(`/api/share/${token}/download-photos-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${shareToken}`,
        },
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Download failed')
      }

      const { url } = await response.json()

      const link = document.createElement('a')
      link.href = url
      link.download = ''
      link.rel = 'noopener'
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch {
      // Silently fail - user can retry
    } finally {
      setDownloadingAllPhotos(false)
    }
  }, [downloadingAllPhotos, shareToken, token])

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setSendingOtp(true)
    setError('')

    try {
      const response = await fetch(`/api/share/${token}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        setOtpSent(true)
        setError('') // Clear any previous errors
      } else {
        // Show generic message to prevent email enumeration
        setError(data.error || t('failedToSendCode'))
      }
    } catch (error) {
      setError(tc('errorTryAgain'))
    } finally {
      setSendingOtp(false)
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !otp) return

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/share/${token}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getConsentHeader() },
        body: JSON.stringify({ email, code: otp }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.shareToken) {
          setShareToken(data.shareToken)
          saveShareToken(storageKey, data.shareToken)
        }
        setIsAuthenticated(true)
        setIsGuest(false)
        setAuthenticatedEmail(email) // Save the authenticated email

        await fetchProjectData(data.shareToken)
      } else {
        setError(t('invalidCode'))
      }
    } catch (error) {
      setError(tc('errorTryAgain'))
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/share/${token}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getConsentHeader() },
        body: JSON.stringify({ password }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.shareToken) {
          setShareToken(data.shareToken)
          saveShareToken(storageKey, data.shareToken)
        }
        setIsAuthenticated(true)
        setIsGuest(false)

        await fetchProjectData(data.shareToken)
      } else {
        setError(t('incorrectPassword'))
      }
    } catch (error) {
      setError(tc('error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleGuestEntry() {
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/share/${token}/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getConsentHeader() },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.shareToken) {
          setShareToken(data.shareToken)
          saveShareToken(storageKey, data.shareToken)
        }
        setIsAuthenticated(true)
        setIsGuest(true)

        await fetchProjectData(data.shareToken)
      } else {
        setError(t('unableToAccessGuest'))
      }
    } catch (error) {
      setError(tc('error'))
    } finally {
      setLoading(false)
    }
  }

  // Show loading state
  if (isPasswordProtected === null) {
    return (
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{tc('loading')}</p>
      </div>
    )
  }

  // Show authentication prompt
  if (isPasswordProtected && !isAuthenticated) {
    return (
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center p-4">
        {/* Language and theme toggles for auth view */}
        <div className="fixed top-3 right-3 z-20 flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md flex flex-col items-center gap-4">
          <BrandLogo height={64} className="mx-auto" />
          <Card className="bg-card border-border w-full">
            <CardHeader className="text-center space-y-3">
              <div className="flex justify-center">
                <Lock className="w-12 h-12 text-muted-foreground" />
              </div>
              <CardTitle className="text-foreground">{t('authRequired')}</CardTitle>
              <p className="text-muted-foreground text-sm mt-2">
                {authMode === 'PASSWORD' && t('passwordPrompt')}
                {authMode === 'OTP' && t('otpPrompt')}
                {authMode === 'BOTH' && t('bothPrompt')}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Password Authentication - hide when OTP code is being entered */}
              {(authMode === 'PASSWORD' || authMode === 'BOTH') && !otpSent && (
                <div className="space-y-4">
                  {authMode === 'BOTH' && (
                    <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">{t('password')}</p>
                  </div>
                )}
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <PasswordInput
                    placeholder={t('enterPassword')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus={authMode === 'PASSWORD'}
                  />
                  <Button
                    type="submit"
                    variant="default"
                    size="default"
                    disabled={loading || !password}
                    className="w-full"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    {loading ? t('verifying') : tc('submit')}
                  </Button>
                </form>
              </div>
            )}

            {/* Divider for BOTH mode - hide when OTP code is being entered */}
            {authMode === 'BOTH' && !otpSent && (
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">{tc('or')}</span>
                </div>
              </div>
            )}

            {/* OTP Authentication */}
            {(authMode === 'OTP' || authMode === 'BOTH') && (
              <div className="space-y-4">
                {authMode === 'BOTH' && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">{t('emailVerification')}</p>
                  </div>
                )}
                {!otpSent ? (
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <Input
                      type="email"
                      placeholder={t('enterEmail')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoFocus={authMode === 'OTP'}
                      required
                    />
                    <Button
                      type="submit"
                      variant="default"
                      size="default"
                      disabled={sendingOtp || !email}
                      className="w-full"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      {sendingOtp ? t('sendingCode') : t('sendCode')}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleOtpSubmit} className="space-y-4">
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground text-center">
                        {t('codePrompt', { email })}
                      </p>
                      <OTPInput
                        value={otp}
                        onChange={setOtp}
                        disabled={loading}
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="default"
                        onClick={() => {
                          setOtpSent(false)
                          setOtp('')
                          setError('')
                        }}
                        className="flex-1"
                      >
                        Back
                      </Button>
                      <Button
                        type="submit"
                        variant="default"
                        size="default"
                        disabled={loading || otp.length !== 6}
                        className="flex-1"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        {loading ? 'Verifying...' : 'Verify'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="p-3 bg-destructive-visible border border-destructive-visible rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Guest Entry Button - hide when OTP code is being entered */}
            {guestMode && !otpSent && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">{t('notRecipient')}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="default"
                  onClick={handleGuestEntry}
                  disabled={loading}
                  className="w-full bg-warning text-warning-foreground hover:bg-warning/90 shadow-elevation hover:shadow-elevation-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-elevation transition-all duration-200"
                >
                  {t('continueAsGuest')}
                </Button>
              </>
            )}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Show project not found
  if (!project) {
    return (
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center p-4">
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('projectNotFound')}</p>
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

  // Filter comments for video or photo context
  const activeVideoIds = new Set(activeVideos.map((v: any) => v.id))
  const filteredComments = isPhotoProject
    ? comments.filter((comment: any) => !comment.photoId || comment.photoId === activePhotoId)
    : comments.filter((comment: any) => !comment.videoId || activeVideoIds.has(comment.videoId))

  // Pin comments for the active photo
  const pinComments = isPhotoProject
    ? filteredComments.filter((c: any) => c.photoId === activePhotoId && c.pinX != null && c.pinY != null)
    : []

  // Ready photos for photo projects
  const readyPhotos = isPhotoProject
    ? [...(project.photos || [])].filter((p: any) => p.status === 'READY').sort((a: any, b: any) => a.sortOrder - b.sortOrder)
    : []
  const activePhoto = readyPhotos.find((p: any) => p.id === activePhotoId)
  const activePhotoUrl = activePhotoId ? photoContentTokens[activePhotoId] : null

  // Show thumbnail grid when in grid view (scrollable)
  if (viewState === 'grid') {
    return (
      <>
      <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
        {/* Grid view toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-background/95 backdrop-blur-sm z-20 flex-shrink-0">
          {/* Left: download all + reverse share upload */}
          <div className="flex items-center gap-2" data-tutorial="grid-actions">
            {(() => {
              if (isGuest) return null
              const approvedCount = project.videosByName
                ? Object.values(project.videosByName as Record<string, any[]>)
                    .filter((versions) => versions.some((v: any) => v.approved))
                    .length
                : 0
              const approvedPhotoCount = project.photos
                ? project.photos.filter((p: any) => p.approved && p.status === 'READY').length
                : 0
              const showDownloadAll = project.allowAssetDownload && approvedCount >= 2 && project.type !== 'PHOTO'
              const showDownloadAllPhotos = project.allowAssetDownload && approvedPhotoCount >= 2
              const showUpload = project.allowReverseShare && shareToken
              if (!showDownloadAll && !showDownloadAllPhotos && !showUpload) return null
              return (
                <>
                  {showDownloadAll && (
                    <button
                      onClick={handleDownloadAll}
                      disabled={downloadingAll}
                      className="p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {downloadingAll ? <Loader2 className="h-5 w-5 text-foreground animate-spin" /> : <Download className="h-5 w-5 text-foreground" />}
                      <span className="hidden sm:inline text-sm font-medium text-foreground">{t('downloadAllVideos', { count: approvedCount })}</span>
                    </button>
                  )}
                  {showDownloadAllPhotos && (
                    <button
                      onClick={handleDownloadAllPhotos}
                      disabled={downloadingAllPhotos}
                      className="p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {downloadingAllPhotos ? <Loader2 className="h-5 w-5 text-foreground animate-spin" /> : <Download className="h-5 w-5 text-foreground" />}
                      <span className="hidden sm:inline text-sm font-medium text-foreground">{t('downloadAllPhotos', { count: approvedPhotoCount })}</span>
                    </button>
                  )}
                  {showUpload && (
                    <ReverseShareUploadPanel
                      shareToken={shareToken}
                      shareSlug={token}
                      maxFiles={project.settings?.maxReverseShareFiles ?? 10}
                    />
                  )}
                </>
              )
            })()}
          </div>

          {/* Right: language, theme, tutorial */}
          <div className="flex items-center gap-2 ml-auto">
            <LanguageToggle />
            <ThemeToggle />
            {project.showClientTutorial && (
              <ShareTutorial
                projectId={project.id || token}
                showTutorial={project.showClientTutorial}
                watermarkEnabled={project.watermarkEnabled}
                hideFeedback={project.hideFeedback}
                clientCanApprove={project.clientCanApprove}
                allowAssetDownload={project.allowAssetDownload}
                allowReverseShare={project.allowReverseShare}
                isGuest={isGuest}
                inPlayerView={false}
              />
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Video grid — hidden for PHOTO projects */}
          {project.type !== 'PHOTO' && (
          <div className="w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8" data-tutorial="video-grid">
            <ThumbnailGrid
              videosByName={project.videosByName}
              thumbnailsByName={thumbnailsByName}
              thumbnailsLoading={thumbnailsLoading}
              onVideoSelect={handleVideoSelect}
              projectTitle={project.title}
              projectDescription={isGuest ? undefined : project.description}
              clientName={isGuest ? undefined : project.clientName}
            />
          </div>
          )}

          {/* Photo-first grid for PHOTO projects */}
          {isPhotoProject && (
            <div className="w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="text-center mb-8 sm:mb-12 pt-4">
                  {!isGuest && project.clientName && (
                    <p className="text-xs sm:text-sm text-muted-foreground mb-2">{project.clientName}</p>
                  )}
                  {project.title && (
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-foreground mb-4">{project.title}</h1>
                  )}
                  {!isGuest && project.description && (
                    <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto mb-6">{project.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{t('selectVideoToBegin')}</p>
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
            </div>
          )}
          {/* Powered by footer */}
          <div className="pb-4 text-center">
            <a
              href="https://www.vitransfer.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              Powered by ViTransfer
            </a>
          </div>
        </div>
      </div>

      {/* Privacy Disclosure Banner */}
      {project.settings?.privacyDisclosureEnabled && (
        <PrivacyBanner customText={project.settings.privacyDisclosureText} slug={token} shareToken={shareToken} />
      )}
      </>
    )
  }

  // Whether to show comment panel (not hidden by project settings, user toggle, or guest status)
  const showCommentPanel = !project.hideFeedback && !isGuest && !hideComments

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
          showCommentToggle={!project.hideFeedback && !isGuest}
          isCommentPanelVisible={!hideComments}
          onToggleCommentPanel={() => setHideComments(!hideComments)}
        />

        <div className="xl:flex-1 xl:min-h-0 flex flex-col xl:flex-row p-2 sm:p-3 gap-2 sm:gap-3">
          {!activePhoto ? (
            <div className="flex-1 flex items-center justify-center p-4">
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No photos ready for review yet. Please check back later.</p>
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
                    onPinPlace={!isGuest && !project.hideFeedback ? (pinX, pinY) => {
                      window.dispatchEvent(new CustomEvent('photoPinPlace', { detail: { photoId: activePhotoId, pinX, pinY } }))
                    } : undefined}
                    onPinClick={(commentId) => setFocusPinId(commentId)}
                    activePinId={focusPinId}
                    canPlace={!isGuest && !project.hideFeedback}
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

                  {/* Photo info bar */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-3 flex items-end justify-between">
                    <div className="text-white text-sm">
                      <span className="font-medium">{activePhoto.name}</span>
                      {activePhoto.approved && (
                        <span className="ml-2 inline-flex items-center gap-1 text-green-400 text-xs">
                          <CheckCircle2 className="w-3 h-3" /> Approved
                        </span>
                      )}
                    </div>
                    {project.allowAssetDownload && !isGuest && activePhoto.approved && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-white hover:bg-white/10"
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/photos/${activePhoto.id}/download-token`, {
                              method: 'POST',
                              headers: shareToken ? { Authorization: `Bearer ${shareToken}` } : {},
                            })
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
                    )}
                  </div>
                </div>
              </div>

              {/* Comments panel */}
              {showCommentPanel && (
                <div className="max-h-[100vh] xl:shrink xl:flex-1 xl:max-w-[30%] 2xl:max-w-[25%] xl:min-w-[280px] flex flex-col xl:max-h-full xl:h-full overflow-hidden rounded-xl bg-card">
                  <CommentSection
                    projectId={project.id}
                    comments={filteredComments}
                    focusCommentId={focusPinId}
                    clientName={project.clientName}
                    clientEmail={project.clientEmail}
                    isApproved={project.status === 'APPROVED' || project.status === 'SHARE_ONLY'}
                    restrictToLatestVersion={false}
                    videos={[]}
                    isAdminView={false}
                    smtpConfigured={project.smtpConfigured}
                    isPasswordProtected={isPasswordProtected || false}
                    recipients={project.recipients || []}
                    shareToken={shareToken}
                    showShortcutsButton={false}
                    timestampDisplayMode={project.timestampDisplay || 'TIMECODE'}
                    mobileCollapsible={true}
                    initialMobileCollapsed={true}
                    authenticatedEmail={authenticatedEmail}
                    allowClientAssetUpload={project.allowClientAssetUpload || false}
                    maxCommentAttachments={project.settings?.maxCommentAttachments ?? 10}
                    onToggleVisibility={() => setHideComments(!hideComments)}
                    showToggleButton={false}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Privacy Disclosure Banner */}
        {project.settings?.privacyDisclosureEnabled && (
          <PrivacyBanner customText={project.settings.privacyDisclosureText} slug={token} shareToken={shareToken} />
        )}
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
          showCommentToggle={!project.hideFeedback && !isGuest}
          isCommentPanelVisible={!hideComments}
          onToggleCommentPanel={() => setHideComments(!hideComments)}
          trailingAction={
            project.showClientTutorial ? (
              <ShareTutorial
                projectId={project.id || token}
                showTutorial={project.showClientTutorial}
                watermarkEnabled={project.watermarkEnabled}
                hideFeedback={project.hideFeedback}
                clientCanApprove={project.clientCanApprove}
                allowAssetDownload={project.allowAssetDownload}
                allowReverseShare={project.allowReverseShare}
                isGuest={isGuest}
                inPlayerView={true}
              />
            ) : undefined
          }
        />

      {/* Main Content Area - scrollable on mobile, fixed on desktop (xl breakpoint for better vertical video support) */}
      <div className="xl:flex-1 xl:min-h-0 flex flex-col xl:flex-row p-2 sm:p-3 gap-2 sm:gap-3">
        {readyVideos.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <Card className="bg-card border-border">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  {tokensLoading ? 'Loading video...' : 'No videos are ready for review yet. Please check back later.'}
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            {/* Video Player - natural height on mobile, fills space on desktop */}
            <div data-tutorial="video-player" className={`xl:h-full xl:min-h-0 xl:flex-1 min-w-0 flex flex-col ${showCommentPanel ? 'xl:flex-[2] 2xl:flex-[2.5]' : ''}`}>
              <VideoPlayer
                videos={readyVideos}
                projectId={project.id}
                projectStatus={project.status}
                defaultQuality={defaultQuality}
                projectTitle={project.title}
                projectDescription={isGuest ? null : project.description}
                clientName={isGuest ? null : project.clientName}
                isPasswordProtected={isPasswordProtected || false}
                watermarkEnabled={project.watermarkEnabled}
                activeVideoName={activeVideoName}
                onApprove={isGuest ? undefined : fetchProjectData}
                authenticatedEmail={authenticatedEmail}
                authenticatedName={authenticatedName}
                initialSeekTime={initialSeekTime}
                initialVideoIndex={initialVideoIndex}
                isAdmin={false}
                isGuest={isGuest}
                allowAssetDownload={project.allowAssetDownload}
                clientCanApprove={project.clientCanApprove}
                shareToken={shareToken}
                comments={!project.hideFeedback && !isGuest ? filteredComments : []}
                timestampDisplayMode={project.timestampDisplay || 'TIMECODE'}
                onCommentFocus={(commentId) => setFocusCommentId(commentId)}
                usePreviewForApprovedPlayback={project.usePreviewForApprovedPlayback}
                fillContainer={true}
              />
            </div>

            {/* Comments Section - max one screen height on mobile, side panel on desktop */}
            {showCommentPanel && (
              <div data-tutorial="comments" className="max-h-[100vh] xl:shrink xl:flex-1 xl:max-w-[30%] 2xl:max-w-[25%] xl:min-w-[280px] flex flex-col xl:max-h-full xl:h-full overflow-hidden rounded-xl bg-card">
                <CommentSection
                  projectId={project.id}
                  comments={filteredComments}
                  focusCommentId={focusCommentId}
                  clientName={project.clientName}
                  clientEmail={project.clientEmail}
                  isApproved={project.status === 'APPROVED' || project.status === 'SHARE_ONLY'}
                  restrictToLatestVersion={project.restrictCommentsToLatestVersion}
                  videos={readyVideos}
                  isAdminView={false}
                  smtpConfigured={project.smtpConfigured}
                  isPasswordProtected={isPasswordProtected || false}
                  recipients={project.recipients || []}
                  shareToken={shareToken}
                  showShortcutsButton={true}
                  timestampDisplayMode={project.timestampDisplay || 'TIMECODE'}
                  mobileCollapsible={true}
                  initialMobileCollapsed={true}
                  authenticatedEmail={authenticatedEmail}
                  allowClientAssetUpload={project.allowClientAssetUpload || false}
                  maxCommentAttachments={project.settings?.maxCommentAttachments ?? 10}
                  onToggleVisibility={() => setHideComments(!hideComments)}
                  showToggleButton={false}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Privacy Disclosure Banner */}
      {project.settings?.privacyDisclosureEnabled && (
        <PrivacyBanner customText={project.settings.privacyDisclosureText} slug={token} shareToken={shareToken} />
      )}
    </div>
  )
}
