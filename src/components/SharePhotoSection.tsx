'use client'

import { useTranslations } from 'next-intl'
import { ChevronRight, Download, ImageIcon, Images, Loader2 } from 'lucide-react'
import type { ShareViewMode } from './ShareViewToggle'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import { useAlbumGallery } from '@/hooks/useAlbumGallery'

interface SharePhotoSectionProps {
  projectId: string
  /** Share bearer token; omit for admin sessions (uses apiFetch instead) */
  shareToken?: string
  allowPhotoDownload: boolean
  /** Page-level view mode, owned by the page top bar */
  viewMode?: ShareViewMode
  /** Reports the album count so the page can feed the hero meta line */
  onAlbumCount?: (count: number) => void
  /** Opening an album hands off to the page, which shows the delivery gallery */
  onOpenAlbum: (albumId: string) => void
}

/**
 * Album cards on the share overview. Opening one hands off to
 * PhotoDeliveryGallery, so an album looks the same whether or not the project
 * also holds videos. Also used on the admin share preview.
 */
export default function SharePhotoSection({ projectId, shareToken, allowPhotoDownload, viewMode = 'grid', onAlbumCount, onOpenAlbum }: SharePhotoSectionProps) {
  const t = useTranslations('photos')

  const { albums, albumsLoading: loading, downloadZip, downloading } = useAlbumGallery({
    projectId,
    shareToken,
    onAlbumCount,
  })


  if (loading || albums.length === 0) return null

  return (
    <>
      {/* Albums overview — rendered inside the share grid page */}
      <div className="mt-8" data-tutorial="photo-albums">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2 min-w-0">
            <span className="rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10">
              <Images className="w-4 h-4 text-primary" />
            </span>
            {t('photoAlbums')}
            <span className="text-xs font-medium text-muted-foreground bg-foreground/5 dark:bg-foreground/10 rounded-full px-2.5 py-0.5">
              {albums.length}
            </span>
          </h2>
          <div className="flex-1" />
          {allowPhotoDownload && albums.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => downloadZip('project')} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline">{t('downloadAllAlbums', { count: albums.length })}</span>
            </Button>
          )}
        </div>

        {viewMode === 'list' ? (
        <div className="space-y-2">
          {albums.map(album => (
            <button
              key={album.id}
              type="button"
              onClick={() => onOpenAlbum(album.id)}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card shadow-elevation-md hover:border-primary/50 hover:shadow-elevation-lg transition-all duration-200 text-left"
            >
              <div className="relative w-20 h-12 rounded-md overflow-hidden bg-muted border border-border flex-shrink-0 flex items-center justify-center">
                {album.coverPhotoId && album.contentToken ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/content/photo/${album.contentToken}?photoId=${album.coverPhotoId}&variant=thumb`}
                    alt={album.name}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="w-4 h-4 text-muted-foreground/50" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{album.name}</p>
                <p className="text-xs text-muted-foreground">{t('photoCount', { count: album.photoCount })}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
        ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {albums.map(album => (
            <button
              key={album.id}
              type="button"
              onClick={() => onOpenAlbum(album.id)}
              className={cn(
                'group relative rounded-lg overflow-hidden',
                'bg-card border border-border/50 shadow-elevation-md',
                'hover:border-primary/50 hover:shadow-elevation-lg',
                'transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background'
              )}
            >
              <div className="aspect-video relative bg-muted">
                {album.coverPhotoId && album.contentToken ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/content/photo/${album.contentToken}?photoId=${album.coverPhotoId}&variant=thumb`}
                    alt={album.name}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted">
                    <ImageIcon className="w-8 h-8 sm:w-12 sm:h-12 text-muted-foreground/50" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200" />
                <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Images className="w-3 h-3" />
                  <span>{album.photoCount}</span>
                </div>
              </div>
              <div className="p-3 sm:p-4">
                <p className="text-sm font-medium text-foreground truncate text-left">{album.name}</p>
                <p className="text-xs text-muted-foreground mt-1 text-left">{t('photoCount', { count: album.photoCount })}</p>
              </div>
            </button>
          ))}
        </div>
        )}
      </div>

    </>
  )
}
