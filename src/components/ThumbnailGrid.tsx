'use client'

import Image from 'next/image'
import { useMemo, useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle2, Film, Layers, Files, Download, Loader2, LayoutGrid, List, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThumbnailGridProps {
  videosByName: Record<string, any[]>
  thumbnailsByName: Map<string, string>
  thumbnailsLoading: boolean
  onVideoSelect: (videoName: string) => void
  projectTitle?: string
  projectDescription?: string
  clientName?: string
  allowAssetDownload?: boolean
  /** Download-all-videos action, shown in the section header (like the photos section) */
  onDownloadAll?: () => void
  downloadingAll?: boolean
  downloadAllLabel?: string
}

const VIDEO_VIEW_STORAGE_KEY = 'vitransfer-share-video-view'

export default function ThumbnailGrid({
  videosByName,
  thumbnailsByName,
  thumbnailsLoading,
  onVideoSelect,
  projectTitle,
  projectDescription,
  clientName,
  allowAssetDownload = false,
  onDownloadAll,
  downloadingAll = false,
  downloadAllLabel,
}: ThumbnailGridProps) {
  const t = useTranslations('share')
  const tv = useTranslations('videos')

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIDEO_VIEW_STORAGE_KEY)
      if (stored === 'list' || stored === 'grid') setViewMode(stored)
    } catch {}
  }, [])

  const changeViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode)
    try { localStorage.setItem(VIDEO_VIEW_STORAGE_KEY, mode) } catch {}
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
          {t('selectVideoToBegin')}
        </p>
      </div>

      {/* Section header — mirrors the photos section (title left, actions right) */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 min-w-0">
          <Film className="w-5 h-5 text-primary flex-shrink-0" />
          {t('videos')}
        </h2>
        <div className="flex-1" />
        {onDownloadAll && (
          <button
            type="button"
            onClick={onDownloadAll}
            disabled={downloadingAll}
            className="p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors flex items-center gap-1.5 disabled:opacity-50 text-sm font-medium text-foreground"
          >
            {downloadingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">{downloadAllLabel || t('videos')}</span>
          </button>
        )}
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => changeViewMode('grid')}
            className={cn('p-2 transition-colors', viewMode === 'grid' ? 'bg-accent text-foreground' : 'bg-background text-muted-foreground hover:text-foreground')}
            title={t('gridView')}
            aria-label={t('gridView')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => changeViewMode('list')}
            className={cn('p-2 transition-colors', viewMode === 'list' ? 'bg-accent text-foreground' : 'bg-background text-muted-foreground hover:text-foreground')}
            title={t('listView')}
            aria-label={t('listView')}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-2">
          {videoNames.map((name) => {
            const videos = videosByName[name]
            const hasApprovedVideo = videos.some((v: any) => v.approved === true)
            const hasAssets = allowAssetDownload && videos.some((v: any) => v.hasAssets === true)
            const versionCount = videos.length
            const thumbnailUrl = thumbnailsByName.get(name)

            return (
              <button
                key={name}
                onClick={() => onVideoSelect(name)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left"
              >
                <div className="relative w-20 h-12 rounded-md overflow-hidden bg-black border border-border flex-shrink-0">
                  {thumbnailUrl ? (
                    <Image
                      src={thumbnailUrl}
                      alt={name}
                      fill
                      sizes="80px"
                      className="object-cover"
                      draggable={false}
                      unoptimized
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted">
                      <Film className="w-4 h-4 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {versionCount} {versionCount === 1 ? tv('versions').slice(0, -1) : tv('versions')}
                  </p>
                </div>
                {hasAssets && <Files className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                {hasApprovedVideo && <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />}
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
            )
          })}
        </div>
      ) : (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {videoNames.map((name) => {
          const videos = videosByName[name]
          const hasApprovedVideo = videos.some((v: any) => v.approved === true)
          const hasAssets = allowAssetDownload && videos.some((v: any) => v.hasAssets === true)
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
                  // unoptimized: in S3 mode /api/content/{token} returns a 302 redirect to a
                  // presigned URL — the Next.js image optimizer cannot follow cross-origin
                  // redirects, so we bypass it and let the browser handle the redirect natively.
                  <Image
                    src={thumbnailUrl}
                    alt={name}
                    fill
                    sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-contain"
                    draggable={false}
                    unoptimized
                  />
                ) : (
                  // Placeholder
                  <div className="absolute inset-0 flex items-center justify-center bg-muted">
                    <Film className="w-8 h-8 sm:w-12 sm:h-12 text-muted-foreground/50" />
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200" />

                {/* Assets indicator */}
                {hasAssets && (
                  <div
                    className="absolute top-2 left-2 bg-black/70 text-white rounded-full p-1"
                    title={t('includesAssets')}
                    aria-label={t('includesAssets')}
                  >
                    <Files className="w-3 h-3 sm:w-4 sm:h-4" />
                  </div>
                )}

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
                  {versionCount} {versionCount === 1 ? tv('versions').slice(0, -1) : tv('versions')}
                </p>
              </div>
            </button>
          )
        })}
      </div>
      )}
    </div>
  )
}
