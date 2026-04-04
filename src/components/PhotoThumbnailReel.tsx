'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Image as ImageIcon, Grid3X3, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import ThemeToggle from '@/components/ThemeToggle'
import LanguageToggle from '@/components/LanguageToggle'

interface Photo {
  id: string
  name: string
  approved: boolean
  status: string
  sortOrder: number
}

interface PhotoThumbnailReelProps {
  photos: Photo[]
  activePhotoId: string
  onPhotoSelect: (photoId: string) => void
  contentTokens: Record<string, string>
  onBackToGrid?: () => void
  showBackButton?: boolean
  showCommentToggle?: boolean
  isCommentPanelVisible?: boolean
  onToggleCommentPanel?: () => void
  showLanguageToggle?: boolean
  trailingAction?: React.ReactNode
}

export default function PhotoThumbnailReel({
  photos,
  activePhotoId,
  onPhotoSelect,
  contentTokens,
  onBackToGrid,
  showBackButton = true,
  showCommentToggle = false,
  isCommentPanelVisible = true,
  onToggleCommentPanel,
  showLanguageToggle = true,
  trailingAction,
}: PhotoThumbnailReelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const hasScrolledRef = useRef(false)

  // Sort photos: unapproved first then approved, preserving sort order within groups
  const sortedPhotos = useMemo(() => {
    const sorted = [...photos]
      .filter(p => p.status === 'READY')
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const forReview = sorted.filter(p => !p.approved)
    const approved = sorted.filter(p => p.approved)
    return [...forReview, ...approved]
  }, [photos])

  const activeIndex = sortedPhotos.findIndex(p => p.id === activePhotoId)
  const totalPhotos = sortedPhotos.length

  const handlePrevPhoto = () => {
    if (activeIndex > 0) {
      onPhotoSelect(sortedPhotos[activeIndex - 1].id)
    }
  }

  const handleNextPhoto = () => {
    if (activeIndex < totalPhotos - 1) {
      onPhotoSelect(sortedPhotos[activeIndex + 1].id)
    }
  }

  const handleToggleExpanded = () => {
    setIsExpanded(!isExpanded)
  }

  // Scroll to active thumbnail when expanded
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !activePhotoId || !isExpanded) return

    if (!hasScrolledRef.current) {
      const idx = sortedPhotos.findIndex(p => p.id === activePhotoId)
      if (idx === -1) return

      const thumbnails = container.querySelectorAll('[data-thumbnail]')
      const activeThumbnail = thumbnails[idx] as HTMLElement
      if (!activeThumbnail) return

      const containerWidth = container.clientWidth
      const thumbnailLeft = activeThumbnail.offsetLeft
      const thumbnailWidth = activeThumbnail.offsetWidth
      const scrollTo = thumbnailLeft - containerWidth / 2 + thumbnailWidth / 2

      container.scrollTo({ left: scrollTo, behavior: 'smooth' })
      hasScrolledRef.current = true
    }
  }, [activePhotoId, sortedPhotos, isExpanded])

  useEffect(() => {
    if (!isExpanded) {
      hasScrolledRef.current = false
    }
  }, [isExpanded])

  const currentPhoto = sortedPhotos[activeIndex]
  const hasApprovedCurrent = currentPhoto?.approved ?? false

  return (
    <div className="relative shrink-0 z-20 p-2 sm:p-3">
      {/* Compact Control Bar */}
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
                title="Back to all photos"
              >
                <Grid3X3 className="w-4 h-4" />
                <span className="hidden sm:inline text-sm">All Photos</span>
              </Button>
            )}
          </div>

          {/* Center: Photo selector */}
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevPhoto}
                disabled={activeIndex <= 0}
                className="h-7 w-7 sm:h-8 sm:w-8"
                title="Previous photo"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <button
                onClick={handleToggleExpanded}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all',
                  'hover:bg-muted/80 active:scale-95',
                  isExpanded && 'bg-muted/50'
                )}
                title={isExpanded ? 'Hide photo thumbnails' : 'Show photo thumbnails'}
              >
                <CheckCircle2
                  className={cn(
                    'w-4 h-4',
                    hasApprovedCurrent ? 'text-success' : 'text-muted-foreground/50'
                  )}
                />
                <span className="text-sm text-muted-foreground tabular-nums">
                  {activeIndex + 1}/{totalPhotos}
                </span>
              </button>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextPhoto}
                disabled={activeIndex >= totalPhotos - 1}
                className="h-7 w-7 sm:h-8 sm:w-8"
                title="Next photo"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Right: Toggle buttons */}
          <div className="flex items-center gap-1">
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
            {showLanguageToggle && <LanguageToggle />}
            <ThemeToggle />
            {trailingAction}
          </div>
        </div>
      </div>

      {/* Floating Thumbnail Overlay */}
      {isExpanded && (
        <div className="absolute left-2 right-2 sm:left-3 sm:right-3 top-full z-30 mt-1">
          <div className="bg-background/90 backdrop-blur-md shadow-lg rounded-xl">
            <div className="px-2 py-3 sm:px-4">
              <div
                ref={scrollContainerRef}
                className="flex gap-2 sm:gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory justify-center"
                style={{
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {sortedPhotos.map((photo) => {
                  const thumbnailUrl = contentTokens[photo.id]
                  const isActive = photo.id === activePhotoId

                  return (
                    <button
                      key={photo.id}
                      data-thumbnail
                      onClick={() => {
                        onPhotoSelect(photo.id)
                        setIsExpanded(false)
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
                      <div className="aspect-square relative bg-muted">
                        {thumbnailUrl ? (
                          <img
                            src={thumbnailUrl}
                            alt={photo.name}
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <ImageIcon className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground/50" />
                          </div>
                        )}

                        {/* Approved badge */}
                        {photo.approved && (
                          <div className="absolute top-1 right-1 bg-success text-success-foreground rounded-full p-0.5">
                            <CheckCircle2 className="w-3 h-3" />
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
                          {photo.name}
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
          onClick={() => setIsExpanded(false)}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
