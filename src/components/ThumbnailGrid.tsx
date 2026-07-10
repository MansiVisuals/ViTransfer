'use client'

import Image from 'next/image'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle2, Film, Layers, Files, Download, Loader2, ChevronRight, Images } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import type { ShareViewMode } from './ShareViewToggle'
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
  /** Page-level view mode, owned by the page top bar */
  viewMode?: ShareViewMode
  /** Album count for the hero meta line (0 hides the entry) */
  albumCount?: number
}

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
  viewMode = 'grid',
  albumCount = 0,
}: ThumbnailGridProps) {
  const t = useTranslations('share')
  const tv = useTranslations('videos')

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

  const videoCount = videoNames.length
  const approvedCount = videoNames.filter(name =>
    videosByName[name].some((v: any) => v.approved === true)
  ).length

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Hero — cinematic title block with a faint accent glow */}
      <div className="relative text-center mb-10 sm:mb-14 pt-10 px-4">
        <div
          className="absolute -top-10 inset-x-0 bottom-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 55% 70% at 50% 0%, hsl(var(--primary) / 0.08), transparent 70%)' }}
        />
        {clientName && (
          <p className="relative text-xs font-semibold text-primary uppercase tracking-[0.22em] mb-3">
            {clientName}
          </p>
        )}
        {projectTitle && (
          <h1 className="relative text-3xl sm:text-4xl font-semibold tracking-tight text-foreground max-w-3xl mx-auto mb-4">
            {projectTitle}
          </h1>
        )}
        <div
          className="relative w-14 h-0.5 mx-auto mb-4 rounded-full"
          style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)' }}
        />
        {projectDescription && (
          <p className="relative text-sm sm:text-base text-muted-foreground max-w-xl mx-auto mb-5 leading-relaxed">
            {projectDescription}
          </p>
        )}
        <div className="relative flex items-center justify-center gap-3.5 flex-wrap text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 opacity-70" />
            {t('metaVideos', { count: videoCount })}
          </span>
          {albumCount > 0 && (
            <>
              <span className="w-[3px] h-[3px] rounded-full bg-muted-foreground/50" />
              <span className="inline-flex items-center gap-1.5">
                <Images className="w-3.5 h-3.5 opacity-70" />
                {t('metaAlbums', { count: albumCount })}
              </span>
            </>
          )}
          {approvedCount > 0 && (
            <>
              <span className="w-[3px] h-[3px] rounded-full bg-muted-foreground/50" />
              <span className="inline-flex items-center gap-1.5 text-success">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t('metaApproved', { approved: approvedCount, total: videoCount })}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Section header — icon badge + title + count, actions right (same anatomy as admin) */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2 min-w-0">
          <span className="rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10">
            <Film className="w-4 h-4 text-primary" />
          </span>
          {t('videos')}
          {videoCount > 0 && (
            <span className="text-xs font-medium text-muted-foreground bg-foreground/5 dark:bg-foreground/10 rounded-full px-2.5 py-0.5">
              {videoCount}
            </span>
          )}
        </h2>
        <div className="flex-1" />
        {onDownloadAll && (
          <Button variant="outline" size="sm" onClick={onDownloadAll} disabled={downloadingAll} data-tutorial="download-all">
            {downloadingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">{downloadAllLabel || t('videos')}</span>
          </Button>
        )}
      </div>

      {videoCount === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Film className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{tv('noVideosYet')}</p>
          </CardContent>
        </Card>
      ) : null}

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
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card shadow-elevation-md hover:border-primary/50 hover:shadow-elevation-lg transition-all duration-200 text-left"
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
                    {versionCount} {versionCount === 1 ? tv('versionSingular') : tv('versions')}
                  </p>
                </div>
                {hasAssets && (
                  <span title={t('includesAssets')} aria-label={t('includesAssets')} className="flex-shrink-0">
                    <Files className="w-4 h-4 text-muted-foreground" />
                  </span>
                )}
                {hasApprovedVideo && (
                  <span title={tv('approved')} aria-label={tv('approved')} className="flex-shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  </span>
                )}
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
                'bg-card border border-border/50 shadow-elevation-md',
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
                  <div
                    className="absolute top-2 right-2 bg-success text-success-foreground rounded-full p-1"
                    title={tv('approved')}
                    aria-label={tv('approved')}
                  >
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
                  {versionCount} {versionCount === 1 ? tv('versionSingular') : tv('versions')}
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
