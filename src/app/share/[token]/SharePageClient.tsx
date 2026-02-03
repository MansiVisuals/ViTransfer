'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
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
import { Lock, Check, Mail, KeyRound } from 'lucide-react'
import BrandLogo from '@/components/BrandLogo'
import { loadShareToken, saveShareToken } from '@/lib/share-token-store'
import ThemeToggle from '@/components/ThemeToggle'

interface SharePageClientProps {
  token: string
}

export default function SharePageClient({ token }: SharePageClientProps) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  // Parse URL parameters for video seeking
  const urlTimestamp = searchParams?.get('t') ? parseInt(searchParams.get('t')!, 10) : null
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
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [error, setError] = useState('')
  const [project, setProject] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [companyName, setCompanyName] = useState('Studio')
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
  const storageKey = token || ''
  const tokenCacheRef = useRef<Map<string, any>>(new Map())

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
    if (authenticatedEmail) return // Already set, skip

    // Match server-provided recipientId with recipients to get email
    const recipient = project.recipients.find((r: any) => r.id === project.authenticatedRecipientId)
    if (recipient?.email) {
      setAuthenticatedEmail(recipient.email)
    }
  }, [project?.authenticatedRecipientId, project?.recipients, authenticatedEmail])


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
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined
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
          headers: shareToken ? { Authorization: `Bearer ${shareToken}` } : undefined
        })

        if (!isMounted) return

        if (response.status === 401) {
          saveShareToken(storageKey, null)
          const data = await response.json()
          if (data.authMode === 'NONE' && data.guestMode) {
            try {
              const guestResponse = await fetch(`/api/share/${token}/guest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

  // Determine initial view state based on URL params
  useEffect(() => {
    if (!project?.videosByName) return

    // If URL specifies a video, go to player
    if (urlVideoName && project.videosByName[urlVideoName]) {
      setViewState('player')
      return
    }

    // Default: show grid (same behavior for single and multiple videos)
    setViewState('grid')
  }, [project?.videosByName, urlVideoName])

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

  // Handle back to grid - remove video param from URL
  const handleBackToGrid = useCallback(() => {
    setViewState('grid')

    // Remove video parameter from URL
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.delete('video')
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
    router.replace(newUrl || '', { scroll: false })
  }, [searchParams, pathname, router])

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
        setError(data.error || 'Failed to send code. Please try again.')
      }
    } catch (error) {
      setError('An error occurred. Please try again.')
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
        headers: { 'Content-Type': 'application/json' },
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
        setError('Invalid or expired code. Please try again.')
      }
    } catch (error) {
      setError('An error occurred. Please try again.')
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
        headers: { 'Content-Type': 'application/json' },
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
        setError('Incorrect password')
      }
    } catch (error) {
      setError('An error occurred')
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
        headers: { 'Content-Type': 'application/json' },
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
        setError('Unable to access as guest')
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
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // Show authentication prompt
  if (isPasswordProtected && !isAuthenticated) {
    return (
      <div className="flex-1 min-h-0 bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md flex flex-col items-center gap-4">
          <BrandLogo height={64} className="mx-auto" />
          <Card className="bg-card border-border w-full">
            <CardHeader className="text-center space-y-3">
              <div className="flex justify-center">
                <Lock className="w-12 h-12 text-muted-foreground" />
              </div>
              <CardTitle className="text-foreground">Authentication Required</CardTitle>
              <p className="text-muted-foreground text-sm mt-2">
                {authMode === 'PASSWORD' && 'Please enter the password to continue.'}
                {authMode === 'OTP' && 'Enter your email to receive an access code.'}
                {authMode === 'BOTH' && 'Choose your preferred authentication method.'}
              </p>
              <p className="text-xs text-muted-foreground mt-3 px-4">
                This authentication is for project recipients only.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Password Authentication - hide when OTP code is being entered */}
              {(authMode === 'PASSWORD' || authMode === 'BOTH') && !otpSent && (
                <div className="space-y-4">
                  {authMode === 'BOTH' && (
                    <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Password</p>
                  </div>
                )}
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <PasswordInput
                    placeholder="Enter password"
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
                    {loading ? 'Verifying...' : 'Submit'}
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
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>
            )}

            {/* OTP Authentication */}
            {(authMode === 'OTP' || authMode === 'BOTH') && (
              <div className="space-y-4">
                {authMode === 'BOTH' && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Email Verification</p>
                  </div>
                )}
                {!otpSent ? (
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <Input
                      type="email"
                      placeholder="Enter your email address"
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
                      {sendingOtp ? 'Sending Code...' : 'Send Verification Code'}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleOtpSubmit} className="space-y-4">
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground text-center">
                        If a recipient exists with <span className="font-medium text-foreground">{email}</span>, you will receive a verification code shortly.
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
                    <span className="bg-card px-2 text-muted-foreground">Not a recipient?</span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="default"
                  onClick={handleGuestEntry}
                  disabled={loading}
                  className="w-full bg-warning text-warning-foreground hover:bg-warning/90 shadow-elevation hover:shadow-elevation-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-elevation transition-all duration-200"
                >
                  Continue as Guest
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

  // Filter comments to only show comments for active videos
  const activeVideoIds = new Set(activeVideos.map((v: any) => v.id))
  const filteredComments = comments.filter((comment: any) => {
    // Show general comments (no videoId) or comments for active videos
    return !comment.videoId || activeVideoIds.has(comment.videoId)
  })

  // Show thumbnail grid when in grid view (scrollable)
  if (viewState === 'grid') {
    return (
      <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
        {/* Theme toggle for grid view */}
        <div className="absolute top-3 right-3 z-20">
          <ThemeToggle />
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
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
    )
  }

  // Whether to show comment panel (not hidden by project settings, user toggle, or guest status)
  const showCommentPanel = !project.hideFeedback && !isGuest && !hideComments

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
            <div className={`xl:h-full xl:min-h-0 xl:flex-1 min-w-0 flex flex-col ${showCommentPanel ? 'xl:flex-[2] 2xl:flex-[2.5]' : ''}`}>
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
              <div className="max-h-[100vh] xl:shrink xl:flex-1 xl:max-w-[30%] 2xl:max-w-[25%] xl:min-w-[280px] flex flex-col xl:max-h-full xl:h-full overflow-hidden rounded-xl bg-card">
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
