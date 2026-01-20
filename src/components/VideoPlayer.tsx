'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Video, ProjectStatus, Comment } from '@prisma/client'
import { Button } from './ui/button'
import { CheckCircle2 } from 'lucide-react'
import CustomVideoControls from './CustomVideoControls'
import ProjectInfo from './ProjectInfo'

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
  timestampDisplayMode?: 'TIMECODE' | 'AUTO' // Timestamp display format (default: TIMECODE)
  onCommentFocus?: (commentId: string) => void // Callback when a timeline marker is clicked
  onVideoStateChange?: (state: {
    selectedVideo: any
    selectedVideoIndex: number
    isVideoApproved: boolean
    displayVideos: any[]
    displayLabel: string
  }) => void // Callback to expose video state for mobile layout
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
  timestampDisplayMode = 'TIMECODE', // Default to TIMECODE format
  onCommentFocus, // Callback when timeline marker is clicked
  onVideoStateChange, // Callback to expose video state for mobile layout
}: VideoPlayerProps) {
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(initialVideoIndex)
  const [videoUrl, setVideoUrl] = useState<string>('')
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
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

  // If ANY video is approved, only show approved videos (for both admin and client)
  // Memoize to prevent infinite loops with onVideoStateChange callback
  const displayVideos = useMemo(() => {
    const hasAnyApprovedVideo = videos.some((v: any) => v.approved === true)
    return hasAnyApprovedVideo
      ? videos.filter((v: any) => v.approved === true)
      : videos
  }, [videos])

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
    const video = videoRef.current
    if (initialSeekTime !== null && video && videoUrl && !hasInitiallySeenRef.current) {
      const handleLoadedMetadata = () => {
        if (video && initialSeekTime !== null) {
          // Ensure timestamp is within video duration
          const duration = video.duration
          const seekTime = Math.min(initialSeekTime, duration)

          video.currentTime = seekTime
          currentTimeRef.current = seekTime
          // Don't auto-play - mobile browsers block this anyway, let user control playback

          // Mark that we've done the initial seek
          hasInitiallySeenRef.current = true
        }
      }

      // If metadata already loaded, seek immediately
      if (video.readyState >= 1) {
        handleLoadedMetadata()
      } else {
        // Otherwise wait for metadata to load
        video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })
      }

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
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
  }, [])

  // Show controls on mouse move
  useEffect(() => {
    const container = containerRef.current
    const handleMouseMove = () => {
      resetControlsTimeout()
    }

    if (container) {
      container.addEventListener('mousemove', handleMouseMove)
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove)
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying])


  // Expose video state to parent for mobile layout
  useEffect(() => {
    if (onVideoStateChange && selectedVideo) {
      onVideoStateChange({
        selectedVideo,
        selectedVideoIndex,
        isVideoApproved,
        displayVideos,
        displayLabel: isVideoApproved ? 'Approved Version' : selectedVideo.versionLabel,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideo?.id, selectedVideoIndex, isVideoApproved])

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

  // Handle approval - stores video name in session storage and calls parent callback
  const handleApprove = async () => {
    if (activeVideoName) {
      sessionStorage.setItem('approvedVideoName', activeVideoName)
    }
    if (onApprove) {
      await onApprove()
    }
  }

  return (
    <div className="space-y-4 flex flex-col max-h-full">
      {/* Version Selector - Show ABOVE video on mobile, BELOW on desktop */}
      {displayVideos.length > 1 && (
        <div className="flex gap-3 overflow-x-auto py-2 flex-shrink-0 lg:order-2">
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

      {/* Video Player Container */}
      <div 
        ref={containerRef}
        className="relative bg-background rounded-lg flex-shrink min-h-0 overflow-hidden group lg:order-1"
        style={{
          aspectRatio: `${selectedVideo?.width || 16} / ${selectedVideo?.height || 9}`
        }}
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
                timestampDisplayMode={timestampDisplayMode}
                onMarkerClick={onCommentFocus}
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

      {/* Video & Project Information - visible on desktop, hidden on mobile (shown separately below comments) */}
      <ProjectInfo
        selectedVideo={selectedVideo}
        displayLabel={displayLabel}
        isVideoApproved={isVideoApproved}
        projectTitle={projectTitle}
        projectDescription={projectDescription}
        clientName={clientName}
        isPasswordProtected={isPasswordProtected}
        watermarkEnabled={watermarkEnabled}
        defaultQuality={defaultQuality}
        onApprove={onApprove ? handleApprove : undefined}
        isAdmin={isAdmin}
        clientCanApprove={clientCanApprove}
        isGuest={isGuest}
        hideDownloadButton={hideDownloadButton}
        allowAssetDownload={allowAssetDownload}
        shareToken={shareToken}
        activeVideoName={activeVideoName}
        className="hidden lg:block lg:order-3"
      />
    </div>
  )
}
