'use client'

import { useRef, useEffect, useState } from 'react'
import { CheckCircle2, ChevronUp, ChevronDown, Film, Layers, Grid3X3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ThumbnailReelProps {
  videosByName: Record<string, any[]>
  thumbnailsByName: Map<string, string>
  activeVideoName: string
  onVideoSelect: (videoName: string) => void
  onBackToGrid?: () => void
  showBackButton?: boolean
}

export default function ThumbnailReel({
  videosByName,
  thumbnailsByName,
  activeVideoName,
  onVideoSelect,
  onBackToGrid,
  showBackButton = true,
}: ThumbnailReelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false) // Will be set based on screen size
  const [isChevronBlinking, setIsChevronBlinking] = useState(false)
  const hasScrolledRef = useRef(false)
  const hasInitializedRef = useRef(false)

  // Detect mobile and set initial collapsed state
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768 // md breakpoint
      setIsMobile(mobile)

      // On first load, set collapsed state based on screen size
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true
        if (!mobile) {
          // Desktop: start collapsed with blinking hint
          setIsCollapsed(true)
          setIsChevronBlinking(true)
          setTimeout(() => setIsChevronBlinking(false), 4500)
        } else {
          // Mobile: start expanded (can still collapse manually)
          setIsCollapsed(false)
        }
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const videoNames = Object.keys(videosByName).sort((a, b) => a.localeCompare(b))

  // Scroll to active thumbnail only on initial mount
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !activeVideoName || isCollapsed || hasScrolledRef.current) return

    const activeIndex = videoNames.indexOf(activeVideoName)
    if (activeIndex === -1) return

    // Find the active thumbnail element
    const thumbnails = container.querySelectorAll('[data-thumbnail]')
    const activeThumbnail = thumbnails[activeIndex] as HTMLElement
    if (!activeThumbnail) return

    // Scroll to center the active thumbnail (only once on mount)
    const containerWidth = container.clientWidth
    const thumbnailLeft = activeThumbnail.offsetLeft
    const thumbnailWidth = activeThumbnail.offsetWidth
    const scrollTo = thumbnailLeft - containerWidth / 2 + thumbnailWidth / 2

    container.scrollTo({ left: scrollTo, behavior: 'smooth' })
    hasScrolledRef.current = true
  }, [activeVideoName, videoNames, isCollapsed])

  return (
    <div className="relative bg-card border-b border-border">
      {/* Header row with collapse toggle and back button on right */}
      <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-2 sm:px-4 sm:py-2.5">
        {/* Spacer */}
        <div className="flex-1" />

        {/* All Videos button */}
        {showBackButton && onBackToGrid && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToGrid}
            className="shrink-0 gap-1.5 px-2 sm:px-3 h-8 sm:h-9"
          >
            <Grid3X3 className="w-4 h-4" />
            <span className="hidden sm:inline text-sm">All Videos</span>
          </Button>
        )}

        {/* Collapse/Expand toggle */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setIsCollapsed(!isCollapsed)
              setIsChevronBlinking(false) // Stop blinking when clicked
            }}
            className={cn(
              'shrink-0 h-8 w-8',
              !isMobile && isChevronBlinking && 'bg-primary/20'
            )}
            style={!isMobile && isChevronBlinking ? {
              animation: 'blink 1.5s ease-in-out 3'
            } : undefined}
            title={isCollapsed ? 'Show video selector' : 'Hide video selector'}
          >
            {isCollapsed ? (
              <ChevronDown className={cn('w-4 h-4', !isMobile && isChevronBlinking && 'text-primary')} />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </Button>

          {/* Info tooltip when blinking - Desktop only */}
          {!isMobile && isChevronBlinking && (
            <div className="absolute right-0 top-full mt-2 bg-foreground text-background text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-50 animate-in fade-in slide-in-from-top-1">
              Click to show videos
              <div className="absolute -top-1 right-3 w-2 h-2 bg-foreground rotate-45" />
            </div>
          )}
        </div>
      </div>

      {/* Thumbnails row - collapsible */}
      {!isCollapsed && (
        <div className="px-2 pb-2 sm:px-4 sm:pb-3">
          {/* Thumbnails container - native touch scrolling */}
          <div
            ref={scrollContainerRef}
            className="flex gap-2 sm:gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory"
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
                  onClick={() => onVideoSelect(name)}
                  className={cn(
                    'shrink-0 rounded-md sm:rounded-lg overflow-hidden snap-start',
                    'bg-muted border-2 transition-all duration-150',
                    'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background',
                    'w-[72px] sm:w-[100px] md:w-[140px] lg:w-[160px]',
                    isActive
                      ? 'border-primary'
                      : 'border-transparent hover:border-border'
                  )}
                >
                  {/* Thumbnail - 16:9 aspect ratio */}
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
                        <Film className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground/50" />
                      </div>
                    )}

                    {/* Approved badge */}
                    {hasApprovedVideo && (
                      <div className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 bg-success text-success-foreground rounded-full p-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </div>
                    )}

                    {/* Version count badge */}
                    {versionCount > 1 && (
                      <div className="absolute bottom-0.5 right-0.5 sm:bottom-1 sm:right-1 bg-black/70 text-white text-[8px] sm:text-[10px] px-1 py-0.5 rounded flex items-center gap-0.5">
                        <Layers className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                        <span>{versionCount}</span>
                      </div>
                    )}

                    {/* Active indicator overlay */}
                    {isActive && (
                      <div className="absolute inset-0 bg-primary/10" />
                    )}
                  </div>

                  {/* Name */}
                  <div className="px-1 py-1 sm:px-2 sm:py-1.5 bg-card">
                    <p
                      className={cn(
                        'text-[10px] sm:text-xs truncate text-left',
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
      )}
    </div>
  )
}
