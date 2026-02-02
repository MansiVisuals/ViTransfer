'use client'

import Image from 'next/image'
import { useMemo } from 'react'
import { CheckCircle2, Film, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThumbnailGridProps {
  videosByName: Record<string, any[]>
  thumbnailsByName: Map<string, string>
  thumbnailsLoading: boolean
  onVideoSelect: (videoName: string) => void
  projectTitle?: string
  projectDescription?: string
  clientName?: string
}

export default function ThumbnailGrid({
  videosByName,
  thumbnailsByName,
  thumbnailsLoading,
  onVideoSelect,
  projectTitle,
  projectDescription,
  clientName,
}: ThumbnailGridProps) {
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

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Project Info Header */}
      <div className="text-center mb-8 sm:mb-12 pt-4">
        {clientName && (
          <p className="text-xs sm:text-sm text-muted-foreground mb-2">
            {clientName}
          </p>
        )}
        {projectTitle && (
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-foreground mb-4">
            {projectTitle}
          </h1>
        )}
        {projectDescription && (
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto mb-6">
            {projectDescription}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Select a video to begin
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:gap-6 xl:grid-cols-4 2xl:grid-cols-5">
        {videoNames.map((name) => {
          const videos = videosByName[name]
          const hasApprovedVideo = videos.some((v: any) => v.approved === true)
          const versionCount = videos.length
          const thumbnailUrl = thumbnailsByName.get(name)

          return (
            <button
              key={name}
              onClick={() => onVideoSelect(name)}
              className={cn(
                'group relative rounded-lg overflow-hidden',
                'bg-card border border-border',
                'hover:border-primary/50 hover:shadow-elevation-lg',
                'transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background'
              )}
            >
              {/* Thumbnail */}
              <div className="aspect-video relative bg-black">
                {thumbnailsLoading ? (
                  // Loading skeleton
                  <div className="absolute inset-0 animate-pulse bg-muted" />
                ) : thumbnailUrl ? (
                  // Thumbnail image - object-contain preserves aspect ratio
                  <Image
                    src={thumbnailUrl}
                    alt={name}
                    fill
                    sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-contain"
                    draggable={false}
                  />
                ) : (
                  // Placeholder
                  <div className="absolute inset-0 flex items-center justify-center bg-muted">
                    <Film className="w-8 h-8 sm:w-12 sm:h-12 text-muted-foreground/50" />
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200" />

                {/* Approved badge */}
                {hasApprovedVideo && (
                  <div className="absolute top-2 right-2 bg-success text-success-foreground rounded-full p-1">
                    <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4" />
                  </div>
                )}

                {/* Version count badge */}
                {versionCount > 1 && (
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    <span>{versionCount}</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3 sm:p-4">
                <p className="text-sm font-medium text-foreground truncate text-left">
                  {name}
                </p>
                <p className="text-xs text-muted-foreground mt-1 text-left">
                  {versionCount} {versionCount === 1 ? 'version' : 'versions'}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
