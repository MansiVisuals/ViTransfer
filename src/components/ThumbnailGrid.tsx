'use client'

import { CheckCircle2, Film, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThumbnailGridProps {
  videosByName: Record<string, any[]>
  thumbnailsByName: Map<string, string>
  thumbnailsLoading: boolean
  onVideoSelect: (videoName: string) => void
  projectTitle?: string
}

export default function ThumbnailGrid({
  videosByName,
  thumbnailsByName,
  thumbnailsLoading,
  onVideoSelect,
  projectTitle,
}: ThumbnailGridProps) {
  const videoNames = Object.keys(videosByName).sort((a, b) => a.localeCompare(b))

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Header */}
      <div className="text-center mb-6 sm:mb-8">
        {projectTitle && (
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground mb-2">
            {projectTitle}
          </h1>
        )}
        <p className="text-sm text-muted-foreground">
          Select a video to start reviewing
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
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
              <div className="aspect-video relative bg-muted">
                {thumbnailsLoading ? (
                  // Loading skeleton
                  <div className="absolute inset-0 animate-pulse bg-muted" />
                ) : thumbnailUrl ? (
                  // Thumbnail image
                  <img
                    src={thumbnailUrl}
                    alt={name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  // Placeholder
                  <div className="absolute inset-0 flex items-center justify-center">
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
                  {hasApprovedVideo && (
                    <span className="text-success ml-2">Approved</span>
                  )}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
