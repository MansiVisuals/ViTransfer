'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Film, Layers, Grid3X3, ChevronDown, ChevronUp, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import ThemeToggle from '@/components/ThemeToggle'

interface ThumbnailReelProps {
  videosByName: Record<string, any[]>
  thumbnailsByName: Map<string, string>
  activeVideoName: string
  onVideoSelect: (videoName: string) => void
  onBackToGrid?: () => void
  showBackButton?: boolean
  // Comment panel controls
  showCommentToggle?: boolean
  isCommentPanelVisible?: boolean
  onToggleCommentPanel?: () => void
}

export default function ThumbnailReel({
  videosByName,
  thumbnailsByName,
  activeVideoName,
  onVideoSelect,
  onBackToGrid,
  showBackButton = true,
  showCommentToggle = false,
  isCommentPanelVisible = true,
  onToggleCommentPanel,
}: ThumbnailReelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // Start collapsed on first load
  const [isExpanded, setIsExpanded] = useState(false)
  const [showHint, setShowHint] = useState(true)
  const hasScrolledRef = useRef(false)
  const hintTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-hide hint after 3 seconds on first load
  useEffect(() => {
    hintTimerRef.current = setTimeout(() => {
      setShowHint(false)
    }, 3000)

    return () => {
      if (hintTimerRef.current) {
        clearTimeout(hintTimerRef.current)
      }
    }
  }, [])

  // Hide hint when user interacts
  const hideHint = () => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current)
      hintTimerRef.current = null
    }
    setShowHint(false)
  }

  const handleToggleExpanded = () => {
    hideHint()
    setIsExpanded(!isExpanded)
  }

  // Sort videos: For review (not approved) first, then approved, both alphabetically
  const videoNames = useMemo(() => {
    const names = Object.keys(videosByName)

    // Separate into review and approved
    const forReview: string[] = []
    const approved: string[] = []

    names.forEach(name => {
      const videos = videosByName[name]
      const hasApprovedVideo = videos.some((v: any) => v.approved === true)
      if (hasApprovedVideo) {
        approved.push(name)
      } else {
        forReview.push(name)
      }
    })

    // Sort each group alphabetically
    forReview.sort((a, b) => a.localeCompare(b))
    approved.sort((a, b) => a.localeCompare(b))

    // Return: review first, then approved
    return [...forReview, ...approved]
  }, [videosByName])

  const activeIndex = videoNames.indexOf(activeVideoName)
  const totalVideos = videoNames.length

  // Navigation
  const handlePrevVideo = () => {
    hideHint()
    if (activeIndex > 0) {
      onVideoSelect(videoNames[activeIndex - 1])
    }
  }

  const handleNextVideo = () => {
    hideHint()
    if (activeIndex < totalVideos - 1) {
      onVideoSelect(videoNames[activeIndex + 1])
    }
  }

  // Scroll to active thumbnail when expanded
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !activeVideoName || !isExpanded) return

    // Reset scroll flag when expanding
    if (!hasScrolledRef.current) {
      const idx = videoNames.indexOf(activeVideoName)
      if (idx === -1) return

      // Find the active thumbnail element
      const thumbnails = container.querySelectorAll('[data-thumbnail]')
      const activeThumbnail = thumbnails[idx] as HTMLElement
      if (!activeThumbnail) return

      // Scroll to center the active thumbnail
      const containerWidth = container.clientWidth
      const thumbnailLeft = activeThumbnail.offsetLeft
      const thumbnailWidth = activeThumbnail.offsetWidth
      const scrollTo = thumbnailLeft - containerWidth / 2 + thumbnailWidth / 2

      container.scrollTo({ left: scrollTo, behavior: 'smooth' })
      hasScrolledRef.current = true
    }
  }, [activeVideoName, videoNames, isExpanded])

  // Reset scroll flag when collapsing
  useEffect(() => {
    if (!isExpanded) {
      hasScrolledRef.current = false
    }
  }, [isExpanded])

  // Get current video info
  const currentVideos = activeVideoName ? videosByName[activeVideoName] : []
  const hasApprovedCurrent = currentVideos.some((v: any) => v.approved === true)

  return (
    <div className="relative shrink-0 z-20 p-2 sm:p-3">
      {/* Compact Control Bar - Always visible */}
      <div className="bg-card/95 backdrop-blur-sm px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Left: Back to grid */}
          <div className="flex items-center">
            {showBackButton && onBackToGrid && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBackToGrid}
                className="shrink-0 gap-1.5 px-2 sm:px-3 h-8"
                title="Back to all videos"
              >
                <Grid3X3 className="w-4 h-4" />
                <span className="hidden sm:inline text-sm">All Videos</span>
              </Button>
            )}
          </div>

          {/* Center: Video selector */}
          <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevVideo}
                disabled={activeIndex <= 0}
                className="h-7 w-7 sm:h-8 sm:w-8"
                title="Previous video"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <button
                onClick={handleToggleExpanded}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all",
                  "hover:bg-muted/80 active:scale-95",
                  isExpanded && "bg-muted/50"
                )}
                title={isExpanded ? "Hide video thumbnails" : "Show video thumbnails (click to browse all videos)"}
              >
                <CheckCircle2
                  className={cn(
                    "w-4 h-4",
                    hasApprovedCurrent ? "text-success" : "text-muted-foreground/50"
                  )}
                />
                <span className="text-sm text-muted-foreground tabular-nums">
                  {activeIndex + 1}/{totalVideos}
                </span>
              </button>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextVideo}
                disabled={activeIndex >= totalVideos - 1}
                className="h-7 w-7 sm:h-8 sm:w-8"
                title="Next video"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Hint text - shows when collapsed to encourage clicking */}
            <span
              className={cn(
                "text-[10px] text-muted-foreground/70 transition-all duration-300",
                showHint && !isExpanded ? "opacity-100" : "opacity-0 h-0 overflow-hidden"
              )}
            >
              click to browse all videos
            </span>
          </div>

          {/* Right: Toggle buttons */}
          <div className="flex items-center gap-1">

            {/* Comment panel toggle */}
            {showCommentToggle && onToggleCommentPanel && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCommentPanel}
                className="hidden lg:flex h-8 w-8"
                title={isCommentPanelVisible ? 'Hide feedback' : 'Show feedback'}
              >
                {isCommentPanelVisible ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRightOpen className="w-4 h-4" />
                )}
              </Button>
            )}

            {/* Theme toggle */}
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Floating Thumbnail Overlay - Appears below the bar, overlays content */}
      {isExpanded && (
        <div
          className="absolute left-2 right-2 sm:left-3 sm:right-3 top-full z-30 mt-1"
        >
          <div className="bg-background/90 backdrop-blur-md shadow-lg rounded-xl">
            <div className="px-2 py-3 sm:px-4">
              {/* Thumbnails container */}
              <div
                ref={scrollContainerRef}
                className="flex gap-2 sm:gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory justify-center"
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {videoNames.map((name) => {
                  const videos = videosByName[name]
                  const hasApprovedVideo = videos.some((v: any) => v.approved === true)
                  const versionCount = videos.length
                  const thumbnailUrl = thumbnailsByName.get(name)
                  const isActive = activeVideoName === name

                  return (
                    <button
                      key={name}
                      data-thumbnail
                      onClick={() => {
                        hideHint()
                        onVideoSelect(name)
                        setIsExpanded(false) // Close after selection
                      }}
                      className={cn(
                        'shrink-0 rounded-md sm:rounded-lg overflow-hidden snap-start',
                        'bg-muted border-2 transition-all duration-150',
                        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background',
                        'w-[80px] sm:w-[110px] md:w-[130px] lg:w-[150px]',
                        isActive
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'border-transparent hover:border-border'
                      )}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-video relative bg-muted">
                        {thumbnailUrl ? (
                          <img
                            src={thumbnailUrl}
                            alt={name}
                            className="absolute inset-0 w-full h-full object-cover"
                            draggable={false}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Film className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground/50" />
                          </div>
                        )}

                        {/* Approved badge */}
                        {hasApprovedVideo && (
                          <div className="absolute top-1 right-1 bg-success text-success-foreground rounded-full p-0.5">
                            <CheckCircle2 className="w-3 h-3" />
                          </div>
                        )}

                        {/* Version count badge */}
                        {versionCount > 1 && (
                          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Layers className="w-2.5 h-2.5" />
                            <span>{versionCount}</span>
                          </div>
                        )}

                        {/* Active overlay */}
                        {isActive && (
                          <div className="absolute inset-0 bg-primary/10" />
                        )}
                      </div>

                      {/* Name */}
                      <div className="px-1.5 py-1 sm:px-2 sm:py-1.5 bg-card/80">
                        <p
                          className={cn(
                            'text-[10px] sm:text-xs truncate text-center',
                            isActive ? 'text-primary font-medium' : 'text-foreground'
                          )}
                        >
                          {name}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => {
            hideHint()
            setIsExpanded(false)
          }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
