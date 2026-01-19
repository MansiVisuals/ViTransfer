'use client'

import { useState, useRef, useEffect } from 'react'
import { Video, ProjectStatus, Comment } from '@prisma/client'
import { Button } from './ui/button'
import { Download, Info, CheckCircle2, Keyboard } from 'lucide-react'
import { formatTimestamp, formatFileSize, formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { VideoAssetDownloadModal } from './VideoAssetDownloadModal'
import { getAccessToken } from '@/lib/token-store'
import CustomVideoControls from './CustomVideoControls'

type CommentWithReplies = Comment & {
  replies?: Comment[]
}

interface VideoPlayerProps {
  videos: Video[]
  projectId: string
  projectStatus: ProjectStatus
  defaultQuality?: '720p' | '1080p' // Default quality from settings
  onApprove?: () => void // Optional approval callback
  projectTitle?: string
  projectDescription?: string
  clientName?: string
  isPasswordProtected?: boolean
  watermarkEnabled?: boolean
  isAdmin?: boolean // Admin users can see all versions (default: false for clients)
  isGuest?: boolean // Guest mode - limited view (videos only, no downloads)
  activeVideoName?: string // The video group name (for maintaining selection after reload)
  initialSeekTime?: number | null // Initial timestamp to seek to (from URL params)
  initialVideoIndex?: number // Initial video index to select (from URL params)
  allowAssetDownload?: boolean // Allow clients to download assets
  clientCanApprove?: boolean // Allow clients to approve videos (false = admin only)
  shareToken?: string | null
  hideDownloadButton?: boolean // Hide download button completely (for admin share view)
  comments?: CommentWithReplies[] // Comments for timeline markers
}

export default function VideoPlayer({
  videos,
  projectId,
  projectStatus,
  defaultQuality = '720p',
  onApprove,
  projectTitle,
  projectDescription,
  clientName,
  isPasswordProtected,
  watermarkEnabled = true,
  isAdmin = false, // Default to false (client view)
  isGuest = false, // Default to false (full client view)
  activeVideoName,
  initialSeekTime = null,
  initialVideoIndex = 0,
  allowAssetDownload = true,
  clientCanApprove = true, // Default to true (clients can approve)
  shareToken = null,
  hideDownloadButton = false, // Default to false (show download button)
  comments = [], // Default to empty array
}: VideoPlayerProps) {
  const router = useRouter()
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(initialVideoIndex)
  const [videoUrl, setVideoUrl] = useState<string>('')
  const [showInfoDialog, setShowInfoDialog] = useState(false)
  const [showApprovalConfirm, setShowApprovalConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [hasAssets, setHasAssets] = useState(false)
  const [checkingAssets, setCheckingAssets] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false)
  const [videoDuration, setVideoDuration] = useState(0)
  const [currentTimeState, setCurrentTimeState] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)

  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hasInitiallySeenRef = useRef(false) // Track if initial seek already happened
  const lastTimeUpdateRef = useRef(0) // Throttle time updates
  const previousVideoNameRef = useRef<string | null>(null)
  const currentTimeRef = useRef(0)
  const selectedVideoIdRef = useRef<string | null>(null)

  const buildAuthHeaders = (shareTokenOverride?: string | null) => {
    const headers: Record<string, string> = {}
    const token = shareTokenOverride || (isAdmin ? getAccessToken() : null)
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    return headers
  }

  // If ANY video is approved, only show approved videos (for both admin and client)
  const hasAnyApprovedVideo = videos.some((v: any) => v.approved === true)
  const displayVideos = hasAnyApprovedVideo
    ? videos.filter((v: any) => v.approved === true)
    : videos

  // Safety check: ensure index is valid
  const safeIndex = Math.min(selectedVideoIndex, displayVideos.length - 1)
  const selectedVideo = displayVideos[safeIndex >= 0 ? safeIndex : 0]

  // Dispatch event when selected video changes (for immediate comment section update)
  useEffect(() => {
    if (selectedVideo?.id) {
      window.dispatchEvent(new CustomEvent('videoChanged', {
        detail: { videoId: selectedVideo.id }
      }))
    }
  }, [selectedVideo?.id])

  useEffect(() => {
    selectedVideoIdRef.current = selectedVideo?.id ?? null
  }, [selectedVideo?.id])

  useEffect(() => {
    if (!activeVideoName) return
    if (previousVideoNameRef.current && previousVideoNameRef.current !== activeVideoName) {
      setSelectedVideoIndex(0)
      setVideoUrl('')
      currentTimeRef.current = 0
    }
    previousVideoNameRef.current = activeVideoName
  }, [activeVideoName])

  // Safety check: ensure selectedVideo exists before accessing properties
  const isVideoApproved = selectedVideo ? (selectedVideo as any).approved === true : false
  const isProjectApproved = projectStatus === 'APPROVED' || projectStatus === 'SHARE_ONLY'

  // Load video URL with optimization
  useEffect(() => {
    async function loadVideoUrl() {
      try {
        // Safety check: ensure selectedVideo exists
        if (!selectedVideo) {
          return
        }

        // Use token-based URLs from the video object
        // These are generated by the share API with secure tokens
        // Respect the default quality setting from admin
        let url: string | undefined

        if (defaultQuality === '1080p') {
          // Prefer 1080p, fallback to 720p
          url = (selectedVideo as any).streamUrl1080p || (selectedVideo as any).streamUrl720p
        } else {
          // Prefer 720p, fallback to 1080p
          url = (selectedVideo as any).streamUrl720p || (selectedVideo as any).streamUrl1080p
        }

        if (url) {
          // Reset player state
          currentTimeRef.current = 0

          // Update video URL - this will trigger React to update the video element's src
          setVideoUrl(url)
        }
      } catch (error) {
        // Video load error - player will show error state
      }
    }

    loadVideoUrl()
  }, [selectedVideo, defaultQuality])

  // Handle initial seek from URL parameters (only once on mount)
  useEffect(() => {
    if (initialSeekTime !== null && videoRef.current && videoUrl && !hasInitiallySeenRef.current) {
      const handleLoadedMetadata = () => {
        if (videoRef.current && initialSeekTime !== null) {
          // Ensure timestamp is within video duration
          const duration = videoRef.current.duration
          const seekTime = Math.min(initialSeekTime, duration)

          videoRef.current.currentTime = seekTime
          currentTimeRef.current = seekTime
          // Don't auto-play - mobile browsers block this anyway, let user control playback

          // Mark that we've done the initial seek
          hasInitiallySeenRef.current = true
        }
      }

      // If metadata already loaded, seek immediately
      if (videoRef.current.readyState >= 1) {
        handleLoadedMetadata()
      } else {
        // Otherwise wait for metadata to load
        videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })
      }

      return () => {
        videoRef.current?.removeEventListener('loadedmetadata', handleLoadedMetadata)
      }
    }
  }, [initialSeekTime, videoUrl])


  // Expose current time for CommentSection
  useEffect(() => {
    const handleGetCurrentTime = (e: CustomEvent) => {
      if (e.detail.callback) {
        e.detail.callback(currentTimeRef.current, selectedVideoIdRef.current)
      }
    }

    window.addEventListener('getCurrentTime' as any, handleGetCurrentTime as EventListener)
    return () => {
      window.removeEventListener('getCurrentTime' as any, handleGetCurrentTime as EventListener)
    }
  }, [])

  // Expose selected video ID for approval
  useEffect(() => {
    const handleGetSelectedVideoId = (e: CustomEvent) => {
      if (e.detail.callback) {
        e.detail.callback(selectedVideoIdRef.current)
      }
    }

    window.addEventListener('getSelectedVideoId' as any, handleGetSelectedVideoId as EventListener)
    return () => {
      window.removeEventListener('getSelectedVideoId' as any, handleGetSelectedVideoId as EventListener)
    }
  }, [])

  // Listen for shortcuts dialog open request from CommentSection
  useEffect(() => {
    const handleOpenShortcuts = () => {
      setShowShortcutsDialog(true)
    }

    window.addEventListener('openShortcutsDialog', handleOpenShortcuts)
    return () => {
      window.removeEventListener('openShortcutsDialog', handleOpenShortcuts)
    }
  }, [])

  // Handle seek to timestamp requests from comments
  useEffect(() => {
    const handleSeekToTime = (e: CustomEvent) => {
      const { timestamp, videoId, videoVersion } = e.detail

      // If videoId is specified and different from current, try to switch to it
      if (videoId && videoId !== selectedVideo.id) {
        const targetVideoIndex = displayVideos.findIndex(v => v.id === videoId)
        if (targetVideoIndex !== -1) {
          setSelectedVideoIndex(targetVideoIndex)
          // Wait for video to load before seeking
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.currentTime = timestamp
              currentTimeRef.current = timestamp
            }
          }, 500)
          return
        }
      }

      // Same video - just seek
      if (videoRef.current) {
        videoRef.current.currentTime = timestamp
        currentTimeRef.current = timestamp
      }
    }

    window.addEventListener('seekToTime' as any, handleSeekToTime as EventListener)
    return () => {
      window.removeEventListener('seekToTime' as any, handleSeekToTime as EventListener)
    }
  }, [selectedVideo.id, displayVideos])

  // Pause video when user starts typing a comment
  useEffect(() => {
    const handlePauseForComment = () => {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause()
      }
    }

    window.addEventListener('pauseVideoForComment', handlePauseForComment)
    return () => {
      window.removeEventListener('pauseVideoForComment', handlePauseForComment)
    }
  }, [])

  // Apply playback speed to video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  useEffect(() => {
    const handleOpenShortcutsDialog = () => {
      setShowShortcutsDialog(true)
    }

    window.addEventListener('openShortcutsDialog', handleOpenShortcutsDialog as EventListener)
    return () => {
      window.removeEventListener('openShortcutsDialog', handleOpenShortcutsDialog as EventListener)
    }
  }, [])

  // Keyboard shortcuts: Ctrl+Space (play/pause), Ctrl+,/. (speed), Ctrl+/ (reset speed), Ctrl+J/L (frame step)
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (!videoRef.current) return

      const video = videoRef.current

      // Ctrl+Space: Play/Pause
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault()
        e.stopPropagation()
        if (video.paused) {
          video.play()
        } else {
          video.pause()
        }
        return
      }

      // Ctrl+, or Ctrl+<: Decrease speed by 0.25x
      if (e.ctrlKey && (e.code === 'Comma' || e.key === '<')) {
        e.preventDefault()
        e.stopPropagation()
        setPlaybackSpeed(prev => Math.max(0.25, prev - 0.25))
        return
      }

      // Ctrl+. or Ctrl+>: Increase speed by 0.25x
      if (e.ctrlKey && (e.code === 'Period' || e.key === '>')) {
        e.preventDefault()
        e.stopPropagation()
        setPlaybackSpeed(prev => Math.min(2.0, prev + 0.25))
        return
      }

      // Ctrl+/: Reset speed to 1.0x
      if (e.ctrlKey && (e.code === 'Slash' || e.key === '/' || e.key === '?')) {
        e.preventDefault()
        e.stopPropagation()
        setPlaybackSpeed(1.0)
        return
      }

      // Ctrl+J: Go back one frame
      if (e.ctrlKey && e.code === 'KeyJ') {
        e.preventDefault()
        e.stopPropagation()
        if (!selectedVideo?.fps) return

        if (!video.paused) {
          video.pause()
        }

        const frameDuration = 1 / selectedVideo.fps
        video.currentTime = Math.max(0, video.currentTime - frameDuration)
        currentTimeRef.current = video.currentTime // Update ref for comment timecode
        window.dispatchEvent(new CustomEvent('videoTimeUpdated', {
          detail: { time: currentTimeRef.current, videoId: selectedVideoIdRef.current }
        }))
        return
      }

      // Ctrl+L: Go forward one frame
      if (e.ctrlKey && e.code === 'KeyL') {
        e.preventDefault()
        e.stopPropagation()
        if (!selectedVideo?.fps) return

        if (!video.paused) {
          video.pause()
        }

        const frameDuration = 1 / selectedVideo.fps
        const duration = Number.isFinite(video.duration) ? video.duration : undefined
        video.currentTime = duration
          ? Math.min(duration, video.currentTime + frameDuration)
          : video.currentTime + frameDuration
        currentTimeRef.current = video.currentTime // Update ref for comment timecode
        window.dispatchEvent(new CustomEvent('videoTimeUpdated', {
          detail: { time: currentTimeRef.current, videoId: selectedVideoIdRef.current }
        }))
        return
      }
    }

    // Use capture phase to intercept events before they reach other elements
    window.addEventListener('keydown', handleKeyboard, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyboard, { capture: true })
    }
  }, [selectedVideo])

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const now = Date.now()
      // Throttle to update max every 200ms instead of 60 times per second
      if (now - lastTimeUpdateRef.current > 200) {
        currentTimeRef.current = videoRef.current.currentTime
        setCurrentTimeState(videoRef.current.currentTime)
        lastTimeUpdateRef.current = now
      }
    }
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration)
      setVolume(videoRef.current.volume)
      setIsMuted(videoRef.current.muted)
    }
  }

  const handleTimelineSeek = (timestamp: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestamp
      currentTimeRef.current = timestamp
      setCurrentTimeState(timestamp)
    }
  }

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
        setIsPlaying(true)
      } else {
        videoRef.current.pause()
        setIsPlaying(false)
      }
    }
  }

  const handleVolumeChange = (newVolume: number) => {
    if (videoRef.current) {
      videoRef.current.volume = newVolume
      setVolume(newVolume)
      if (newVolume > 0 && isMuted) {
        videoRef.current.muted = false
        setIsMuted(false)
      }
    }
  }

  const handleToggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted
      setIsMuted(videoRef.current.muted)
    }
  }

  const handleToggleFullscreen = () => {
    if (!containerRef.current || !videoRef.current) return

    // Mobile devices (especially iOS) need special handling
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    const video = videoRef.current as any // Type cast for webkit APIs
    
    if (!document.fullscreenElement) {
      // Try native video fullscreen first (better for mobile)
      if (isMobile && video.webkitEnterFullscreen) {
        // iOS Safari
        try {
          video.webkitEnterFullscreen()
          setIsFullscreen(true)
        } catch (error) {
          console.error('Failed to enter fullscreen:', error)
        }
      } else if (isMobile && video.requestFullscreen) {
        // Android Chrome
        try {
          video.requestFullscreen()
          setIsFullscreen(true)
        } catch (error) {
          console.error('Failed to enter fullscreen:', error)
        }
      } else if (containerRef.current.requestFullscreen) {
        // Desktop browsers
        try {
          containerRef.current.requestFullscreen()
          setIsFullscreen(true)
        } catch (error) {
          console.error('Failed to enter fullscreen:', error)
        }
      }
    } else {
      // Exit fullscreen
      try {
        document.exitFullscreen()
        setIsFullscreen(false)
      } catch (error) {
        console.error('Failed to exit fullscreen:', error)
      }
    }
  }

  const handleFrameStep = (direction: 'forward' | 'backward') => {
    if (!videoRef.current || !selectedVideo?.fps) return

    if (!videoRef.current.paused) {
      videoRef.current.pause()
      setIsPlaying(false)
    }

    const frameDuration = 1 / selectedVideo.fps
    const newTime = direction === 'forward'
      ? Math.min(videoDuration, videoRef.current.currentTime + frameDuration)
      : Math.max(0, videoRef.current.currentTime - frameDuration)
    
    videoRef.current.currentTime = newTime
    currentTimeRef.current = newTime
    setCurrentTimeState(newTime)
    
    window.dispatchEvent(new CustomEvent('videoTimeUpdated', {
      detail: { time: currentTimeRef.current, videoId: selectedVideoIdRef.current }
    }))
  }

  // Auto-hide controls when not in use
  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    setShowControls(true)
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false)
      }, 3000)
    }
  }

  // Track video play/pause events
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handlePlay = () => {
      setIsPlaying(true)
      resetControlsTimeout()
    }
    const handlePause = () => setIsPlaying(false)
    const handleVolumeChangeEvent = () => {
      setVolume(video.volume)
      setIsMuted(video.muted)
    }

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('volumechange', handleVolumeChangeEvent)

    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('volumechange', handleVolumeChangeEvent)
    }
  }, [])

  // Fullscreen change event (handles both desktop and mobile)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      )
      setIsFullscreen(isCurrentlyFullscreen)
    }

    const video = videoRef.current
    if (video) {
      // iOS Safari fullscreen events
      const handleWebkitBegin = () => setIsFullscreen(true)
      const handleWebkitEnd = () => setIsFullscreen(false)
      
      video.addEventListener('webkitbeginfullscreen', handleWebkitBegin)
      video.addEventListener('webkitendfullscreen', handleWebkitEnd)
      
      // Standard fullscreen events
      document.addEventListener('fullscreenchange', handleFullscreenChange)
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.addEventListener('mozfullscreenchange', handleFullscreenChange)
      document.addEventListener('MSFullscreenChange', handleFullscreenChange)
      
      return () => {
        video.removeEventListener('webkitbeginfullscreen', handleWebkitBegin)
        video.removeEventListener('webkitendfullscreen', handleWebkitEnd)
        document.removeEventListener('fullscreenchange', handleFullscreenChange)
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
        document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
        document.removeEventListener('MSFullscreenChange', handleFullscreenChange)
      }
    }
  }, [videoRef.current])

  // Show controls on mouse move
  useEffect(() => {
    const handleMouseMove = () => {
      resetControlsTimeout()
    }

    if (containerRef.current) {
      containerRef.current.addEventListener('mousemove', handleMouseMove)
    }

    return () => {
      if (containerRef.current) {
        containerRef.current.removeEventListener('mousemove', handleMouseMove)
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
    }
  }, [isPlaying])

  const handleDownload = async () => {
    // Use secure token-based download URL
    const downloadUrl = (selectedVideo as any).downloadUrl
    if (!downloadUrl) {
      alert('Download is only available for approved projects')
      return
    }

    // Check if assets are available and asset downloads are allowed
    if (allowAssetDownload && !isGuest && !isAdmin) {
      setCheckingAssets(true)

      const authHeaders = buildAuthHeaders(shareToken)
      // Check if this video has assets (non-blocking)
      fetch(`/api/videos/${selectedVideo.id}/assets`, {
        headers: authHeaders,
      })
        .then(async (response) => {
          if (response.ok) {
            const data = await response.json()
            if (data.assets && data.assets.length > 0) {
              setHasAssets(true)
              setShowDownloadModal(true)
              setCheckingAssets(false)
              return true
            }
          }
          return false
        })
        .catch((err) => {
          // If checking fails, just proceed with direct download
          return false
        })
        .then((hasAssets) => {
          setCheckingAssets(false)
          if (!hasAssets) {
            // Direct download if no assets
            triggerDownload(downloadUrl)
          }
        })
      return
    }

    // Direct download if no assets or not allowed
    triggerDownload(downloadUrl)
  }

  const triggerDownload = (url: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = ''
    link.rel = 'noopener'
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleApprove = async () => {
    setLoading(true)

    const authHeaders = buildAuthHeaders(shareToken)
    // Approve project in background without blocking UI
    fetch(`/api/projects/${projectId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        selectedVideoId: selectedVideo.id,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to approve project')
        }
        return response
      })
      .then(() => {
        // Store the current video group name in sessionStorage to restore after reload
        if (activeVideoName) {
          sessionStorage.setItem('approvedVideoName', activeVideoName)
        }

        // Call the optional callback if provided (for parent component updates)
        if (onApprove) {
          return onApprove()
        }
      })
      .catch((error) => {
        alert('Failed to approve project')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  // Safety check: if no videos available, show message
  if (!selectedVideo || displayVideos.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No videos available
      </div>
    )
  }

  // Get display label - if video approved, show "Approved Version"
  const displayLabel = isVideoApproved ? 'Approved Version' : selectedVideo.versionLabel

  return (
    <div className="space-y-4 flex flex-col max-h-full">
      {/* Video Player Container */}
      <div 
        ref={containerRef}
        className="relative bg-background rounded-lg aspect-video flex-shrink min-h-0 overflow-hidden group"
      >
        {videoUrl ? (
          <>
            <video
              key={selectedVideo?.id}
              ref={videoRef}
              src={videoUrl}
              poster={(selectedVideo as any).thumbnailUrl || undefined}
              className="w-full h-full rounded-lg cursor-pointer"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onContextMenu={!isAdmin ? (e) => e.preventDefault() : undefined}
              onClick={handlePlayPause}
              crossOrigin="anonymous"
              playsInline
              preload="metadata"
              // @ts-ignore - webkit attributes for iOS
              webkit-playsinline="true"
              x-webkit-airplay="allow"
              style={{
                objectFit: 'contain',
                backgroundColor: '#000',
              }}
            />

            {/* Custom Video Controls with Integrated Timeline */}
            <div 
              className={`transition-opacity duration-300 ${
                showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <CustomVideoControls
                videoRef={videoRef as React.RefObject<HTMLVideoElement>}
                videoDuration={videoDuration}
                currentTime={currentTimeState}
                isPlaying={isPlaying}
                volume={volume}
                isMuted={isMuted}
                isFullscreen={isFullscreen}
                onPlayPause={handlePlayPause}
                onSeek={handleTimelineSeek}
                onVolumeChange={handleVolumeChange}
                onToggleMute={handleToggleMute}
                onToggleFullscreen={handleToggleFullscreen}
                onFrameStep={handleFrameStep}
                comments={comments}
                videoFps={selectedVideo?.fps || 24}
                videoId={selectedVideo?.id}
                isAdmin={isAdmin}
              />
            </div>

            {/* Playback Speed Indicator - Show when speed is not 1.0x */}
            {playbackSpeed !== 1.0 && (
              <div className="absolute top-4 right-4 bg-black/80 text-white px-3 py-1.5 rounded-md text-sm font-medium pointer-events-none z-20">
                {playbackSpeed.toFixed(2)}x
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-card-foreground">
            Loading video...
          </div>
        )}
      </div>

      {/* Version Selector - Only show if there are multiple versions to choose from */}
      {displayVideos.length > 1 && (
        <div className="flex gap-3 overflow-x-auto py-2 flex-shrink-0">
          {displayVideos.map((video, index) => {
            const videoApproved = (video as any).approved === true
            return (
              <Button
                key={video.id}
                onClick={() => setSelectedVideoIndex(index)}
                variant={selectedVideoIndex === index ? 'default' : 'outline'}
                className="whitespace-nowrap relative"
              >
                {videoApproved && (
                  <CheckCircle2 className="w-4 h-4 mr-2 text-success" />
                )}
                {videoApproved ? 'Approved Version' : video.versionLabel}
              </Button>
            )
          })}
        </div>
      )}

      {/* Video & Project Information */}
      <div className={`rounded-lg p-4 text-card-foreground flex-shrink-0 ${!isVideoApproved ? 'bg-accent/50 border-2 border-primary/20' : 'bg-card border border-border'}`}>
        <Dialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog}>
          <DialogContent className="bg-card border-border text-card-foreground max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Keyboard Shortcuts</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Video playback controls
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Play / Pause</span>
                <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+Space</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Decrease Speed</span>
                <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+,</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Increase Speed</span>
                <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+.</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Reset Speed</span>
                <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+/</kbd>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-muted-foreground">Previous Frame</span>
                <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+J</kbd>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground">Next Frame</span>
                <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+L</kbd>
              </div>
              <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
                Frame stepping pauses the video automatically. Speed range: 0.25x - 2.0x
              </p>
            </div>
          </DialogContent>
        </Dialog>

        {/* Header: Version + Action Buttons, then Filename below */}
        <div className="space-y-3 mb-3 pb-3 border-b border-border">
          {/* Top row: Approved Badge + Version Label + Action Buttons */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {isVideoApproved && (
                <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
              )}
              <span className="text-base font-semibold text-foreground whitespace-nowrap">{displayLabel}</span>
            </div>
            <div className="flex gap-2 flex-shrink-0">
            {/* Info Dialog Button - Hide in guest mode */}
            {!isGuest && (
              <Dialog open={showInfoDialog} onOpenChange={setShowInfoDialog}>
                <Button variant="outline" size="sm" onClick={() => setShowInfoDialog(true)}>
                  <Info className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Info</span>
                </Button>
                <DialogContent className="bg-card border-border text-card-foreground max-w-[95vw] sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Video Information</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      Detailed metadata for the original video
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 text-xs sm:text-sm">
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground">Filename:</span>
                      <span className="font-medium break-all text-xs sm:text-sm">{selectedVideo.originalFileName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Resolution:</span>
                      <span className="font-medium">{selectedVideo.width}x{selectedVideo.height}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Codec:</span>
                      <span className="font-medium">{selectedVideo.codec || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="font-medium">{formatTimestamp(selectedVideo.duration)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">FPS:</span>
                      <span className="font-medium">{selectedVideo.fps ? selectedVideo.fps.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">File Size:</span>
                      <span className="font-medium">{formatFileSize(Number(selectedVideo.originalFileSize))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Upload Date:</span>
                      <span className="font-medium">{formatDate(selectedVideo.createdAt)}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="text-muted-foreground">Status:</span>
                      <span className="font-medium break-words">
                        {isVideoApproved
                          ? 'Approved - Original Quality'
                          : `Downscaled Preview (${defaultQuality})${watermarkEnabled ? ' with Watermark' : ''}`
                        }
                      </span>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {/* Download Button - Only show when video is approved and not in guest mode */}
            {isVideoApproved && !isGuest && !hideDownloadButton && (
              <Button onClick={handleDownload} variant="default" size="sm">
                <Download className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Download</span>
              </Button>
            )}
            </div>
          </div>

          {/* Bottom row: Filename */}
          <div>
            <h3 className="text-lg font-bold text-foreground break-words">{(selectedVideo as any).name}</h3>
          </div>
        </div>

        {/* Information Grid - Compact 2 column layout */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {/* Project */}
          {projectTitle && (
            <div className="col-span-2">
              <span className="text-xs text-muted-foreground">Project:</span>
              <span className="ml-2 font-medium text-foreground">{projectTitle}</span>
            </div>
          )}

          {/* For (Client) */}
          {clientName && (
            <div className="col-span-2">
              <span className="text-xs text-muted-foreground">For:</span>
              <span className="ml-2 font-medium text-foreground">{isPasswordProtected ? clientName : 'Client'}</span>
            </div>
          )}

          {/* Description */}
          {projectDescription && (
            <div className="col-span-2">
              <span className="text-xs text-muted-foreground">Description:</span>
              <span className="ml-2 text-foreground whitespace-pre-wrap">{projectDescription}</span>
            </div>
          )}
        </div>

        {/* Note & Approval Section (only if video not approved and approval is allowed) */}
        {/* Show approve button if: video not approved, callback exists, and (user is admin OR clients can approve) */}
        {!isVideoApproved && onApprove && (isAdmin || clientCanApprove) && (
          <>
            <div className="text-xs text-muted-foreground pt-3 mt-3 border-t border-border">
              <span className="font-medium text-foreground">Note:</span> This is a downscaled preview{watermarkEnabled && ' with watermark'}. Original quality will be available for download once approved.
            </div>

            <div className="pt-2 mt-2">
              {!showApprovalConfirm ? (
                <Button
                  onClick={() => setShowApprovalConfirm(true)}
                  variant="success"
                  size="default"
                  className="w-full"
                >
                  Approve this video as final
                </Button>
              ) : (
                <div className="space-y-4 bg-primary/10 border-2 border-primary rounded-lg p-4">
                  <div className="text-center space-y-2">
                    <p className="text-base text-foreground font-bold">
                      Approve this video?
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Video: <span className="font-semibold text-foreground">{(selectedVideo as any).name}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Version: <span className="font-semibold text-foreground">{selectedVideo.versionLabel}</span>
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleApprove}
                      disabled={loading}
                      variant="success"
                      size="default"
                      className="flex-1 font-semibold"
                    >
                      {loading ? 'Approving...' : 'Yes, Approve This Video'}
                    </Button>
                    <Button
                      onClick={() => setShowApprovalConfirm(false)}
                      variant="outline"
                      disabled={loading}
                      size="default"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Approved Status */}
        {isVideoApproved && (
          <div className="flex items-center gap-2 text-sm text-success pt-3 mt-3 border-t border-border">
            <CheckCircle2 className="w-4 h-4" />
            <span className="font-medium">
              {selectedVideo.versionLabel} approved - Download available
            </span>
          </div>
        )}
      </div>

      {/* Download Modal - Only for clients with assets */}
      {showDownloadModal && hasAssets && (
        <VideoAssetDownloadModal
          videoId={selectedVideo.id}
          videoName={(selectedVideo as any).name || ''}
          versionLabel={selectedVideo.versionLabel}
          isOpen={showDownloadModal}
          onClose={() => setShowDownloadModal(false)}
          shareToken={shareToken}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}
