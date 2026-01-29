'use client'

import { useRef, useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Film, Layers } from 'lucide-react'
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
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const videoNames = Object.keys(videosByName).sort((a, b) => a.localeCompare(b))

  // Check scroll state
  const updateScrollState = () => {
    const container = scrollContainerRef.current
    if (!container) return

    setCanScrollLeft(container.scrollLeft > 0)
    setCanScrollRight(
      container.scrollLeft < container.scrollWidth - container.clientWidth - 1
    )
  }

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    updateScrollState()
    container.addEventListener('scroll', updateScrollState)
    window.addEventListener('resize', updateScrollState)

    return () => {
      container.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
    }
  }, [])

  // Scroll to active thumbnail on mount or when active changes
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !activeVideoName) return

    const activeIndex = videoNames.indexOf(activeVideoName)
    if (activeIndex === -1) return

    // Find the active thumbnail element
    const thumbnails = container.querySelectorAll('[data-thumbnail]')
    const activeThumbnail = thumbnails[activeIndex] as HTMLElement
    if (!activeThumbnail) return

    // Scroll to center the active thumbnail
    const containerWidth = container.clientWidth
    const thumbnailLeft = activeThumbnail.offsetLeft
    const thumbnailWidth = activeThumbnail.offsetWidth
    const scrollTo = thumbnailLeft - containerWidth / 2 + thumbnailWidth / 2

    container.scrollTo({ left: scrollTo, behavior: 'smooth' })
  }, [activeVideoName, videoNames])

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current
    if (!container) return

    const scrollAmount = container.clientWidth * 0.7
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  return (
    <div className="relative bg-card border-t border-border">
      <div className="flex items-center gap-2 px-3 py-3 sm:px-4">
        {/* Back button */}
        {showBackButton && onBackToGrid && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToGrid}
            className="shrink-0 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">All Videos</span>
          </Button>
        )}

        {/* Scroll left button - desktop only */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll('left')}
          disabled={!canScrollLeft}
          className={cn(
            'shrink-0 hidden sm:flex',
            !canScrollLeft && 'opacity-30'
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>

        {/* Thumbnails container */}
        <div
          ref={scrollContainerRef}
          className="flex-1 flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
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
                  'shrink-0 rounded-lg overflow-hidden',
                  'bg-muted border-2 transition-all duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background',
                  isActive
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-transparent hover:border-border'
                )}
                style={{ width: '120px' }}
              >
                {/* Thumbnail */}
                <div className="aspect-video relative bg-muted">
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt={name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Film className="w-6 h-6 text-muted-foreground/50" />
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
                    <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded flex items-center gap-0.5">
                      <Layers className="w-2.5 h-2.5" />
                      <span>{versionCount}</span>
                    </div>
                  )}

                  {/* Active indicator overlay */}
                  {isActive && (
                    <div className="absolute inset-0 bg-primary/10" />
                  )}
                </div>

                {/* Name */}
                <div className="px-2 py-1.5 bg-card">
                  <p
                    className={cn(
                      'text-xs truncate text-left',
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

        {/* Scroll right button - desktop only */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll('right')}
          disabled={!canScrollRight}
          className={cn(
            'shrink-0 hidden sm:flex',
            !canScrollRight && 'opacity-30'
          )}
        >
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  )
}
