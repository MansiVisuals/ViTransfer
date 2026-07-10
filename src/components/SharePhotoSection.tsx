'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, Download, Grid3X3, ImageIcon, Images, Loader2 } from 'lucide-react'
import PhotoGrid, { GalleryPhoto } from './PhotoGrid'
import type { ShareViewMode } from './ShareViewToggle'
import PhotoLightbox from './PhotoLightbox'
import { Button } from './ui/button'
import ThemeToggle from './ThemeToggle'
import LanguageToggle from './LanguageToggle'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-client'
import { logError } from '@/lib/logging'

interface Album {
  id: string
  name: string
  photoCount: number
  coverPhotoId: string | null
  contentToken: string | null
}

interface SharePhotoSectionProps {
  projectId: string
  /** Share bearer token; omit for admin sessions (uses apiFetch instead) */
  shareToken?: string
  allowPhotoDownload: boolean
  /** Page-level view mode, owned by the page top bar */
  viewMode?: ShareViewMode
  /** Reports the album count so the page can feed the hero meta line */
  onAlbumCount?: (count: number) => void
}

/**
 * Client-facing photo gallery on the share page: album cards, photo grid,
 * lightbox, and zip downloads (selection / album / all albums).
 * Also used on the admin share preview (without a share token).
 */
export default function SharePhotoSection({ projectId, shareToken, allowPhotoDownload, viewMode = 'grid', onAlbumCount }: SharePhotoSectionProps) {
  const t = useTranslations('photos')
  const ts = useTranslations('share')

  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)

  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [contentToken, setContentToken] = useState<string | null>(null)
  const [photosLoading, setPhotosLoading] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [reelExpanded, setReelExpanded] = useState(false)

  // Share sessions authenticate with the share bearer token; admin preview
  // sessions fall back to apiFetch (admin access token + refresh handling)
  const doFetch = useCallback((url: string, init?: RequestInit): Promise<Response> => {
    if (shareToken) {
      return fetch(url, {
        ...init,
        headers: { ...(init?.headers as Record<string, string> | undefined), Authorization: `Bearer ${shareToken}` },
      })
    }
    return apiFetch(url, init)
  }, [shareToken])

  const fetchAlbums = useCallback(async () => {
    try {
      const res = await doFetch(`/api/projects/${projectId}/photo-albums`)
      if (res.ok) {
        const data = await res.json()
        setAlbums(data.albums || [])
        onAlbumCount?.((data.albums || []).length)
      }
    } catch (error) {
      logError('Error fetching photo albums:', error)
    } finally {
      setLoading(false)
    }
  }, [projectId, doFetch, onAlbumCount])

  const fetchPhotos = useCallback(async (albumId: string) => {
    setPhotosLoading(true)
    try {
      const res = await doFetch(`/api/projects/${projectId}/photo-albums/${albumId}/photos`)
      if (res.ok) {
        const data = await res.json()
        setPhotos(data.photos || [])
        setContentToken(data.contentToken || null)
      }
    } catch (error) {
      logError('Error fetching photos:', error)
    } finally {
      setPhotosLoading(false)
    }
  }, [projectId, doFetch])

  useEffect(() => {
    fetchAlbums()
  }, [fetchAlbums])

  useEffect(() => {
    setSelectedIds(new Set())
    setReelExpanded(false)
    if (selectedAlbum) {
      fetchPhotos(selectedAlbum.id)
    } else {
      setPhotos([])
      setContentToken(null)
    }
  }, [selectedAlbum, fetchPhotos])

  const buildPhotoUrl = useCallback((photoId: string, variant: 'thumb' | 'full') => {
    return `/api/content/photo/${contentToken}?photoId=${photoId}&variant=${variant}`
  }, [contentToken])

  const handleZipDownload = async (scope: 'selection' | 'album' | 'project') => {
    setDownloading(true)
    try {
      const body =
        scope === 'selection' && selectedAlbum
          ? { scope, albumId: selectedAlbum.id, photoIds: Array.from(selectedIds) }
          : scope === 'album' && selectedAlbum
            ? { scope, albumId: selectedAlbum.id }
            : { scope: 'project' as const }

      const res = await doFetch(`/api/projects/${projectId}/photos/download-zip-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) return
      const { url } = await res.json()
      const a = document.createElement('a')
      a.href = url
      a.download = ''
      a.rel = 'noopener'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (error) {
      logError('Error downloading photos:', error)
    } finally {
      setDownloading(false)
    }
  }

  const toggleSelect = (photoId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(photoId)) next.delete(photoId)
      else next.add(photoId)
      return next
    })
  }

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
            <Button variant="outline" size="sm" onClick={() => handleZipDownload('project')} disabled={downloading}>
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
              onClick={() => setSelectedAlbum(album)}
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
              onClick={() => setSelectedAlbum(album)}
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

      {/* Album view — full page with the same top bar as the video review page */}
      {selectedAlbum && (() => {
        const albumIndex = albums.findIndex(a => a.id === selectedAlbum.id)
        return (
        <div className="fixed inset-0 z-40 bg-background flex flex-col overflow-hidden">
          <div className="relative shrink-0 z-20 p-2 sm:p-3">
            <div className="bg-card/95 backdrop-blur-sm px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl">
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Left: Back to overview */}
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedAlbum(null)}
                    className="shrink-0 gap-1.5 px-2 sm:px-3 h-8"
                    title={ts('backToOverview')}
                  >
                    <Grid3X3 className="w-4 h-4" />
                    <span className="hidden sm:inline text-sm">{ts('backToOverview')}</span>
                  </Button>
                </div>

                {/* Center: Album selector */}
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => albumIndex > 0 && setSelectedAlbum(albums[albumIndex - 1])}
                      disabled={albumIndex <= 0}
                      className="h-7 w-7 sm:h-8 sm:w-8"
                      title={t('previousAlbum')}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>

                    <button
                      onClick={() => setReelExpanded(prev => !prev)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all',
                        'hover:bg-muted/80 active:scale-95',
                        reelExpanded && 'bg-muted/50'
                      )}
                      title={selectedAlbum.name}
                    >
                      <Images className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {albumIndex + 1}/{albums.length}
                      </span>
                    </button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => albumIndex < albums.length - 1 && setSelectedAlbum(albums[albumIndex + 1])}
                      disabled={albumIndex >= albums.length - 1}
                      className="h-7 w-7 sm:h-8 sm:w-8"
                      title={t('nextAlbum')}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Right: downloads + language/theme toggles */}
                <div className="flex items-center gap-1">
                  {allowPhotoDownload && selectedIds.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleZipDownload('selection')}
                      disabled={downloading}
                      className="gap-1.5 px-2 h-8"
                      title={t('downloadSelected', { count: selectedIds.size })}
                    >
                      {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      <span className="text-sm tabular-nums">{selectedIds.size}</span>
                    </Button>
                  )}
                  {allowPhotoDownload && photos.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleZipDownload('album')}
                      disabled={downloading}
                      className="h-8 w-8"
                      title={t('downloadAlbum')}
                    >
                      {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    </Button>
                  )}
                  {shareToken && <LanguageToggle />}
                  <ThemeToggle />
                </div>
              </div>
            </div>

            {/* Floating album covers overlay — same pattern as the video reel */}
            {reelExpanded && (
              <div className="absolute left-2 right-2 sm:left-3 sm:right-3 top-full z-30 mt-1">
                <div className="bg-background/90 backdrop-blur-md shadow-lg rounded-xl">
                  <div className="px-2 py-3 sm:px-4">
                    <div
                      className="flex gap-2 sm:gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory justify-center"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
                    >
                      {albums.map(album => {
                        const isActive = album.id === selectedAlbum.id
                        return (
                          <button
                            key={album.id}
                            onClick={() => { setSelectedAlbum(album); setReelExpanded(false) }}
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
                            <div className="aspect-video relative bg-black">
                              {album.coverPhotoId && album.contentToken ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={`/api/content/photo/${album.contentToken}?photoId=${album.coverPhotoId}&variant=thumb`}
                                  alt={album.name}
                                  loading="lazy"
                                  className="absolute inset-0 w-full h-full object-cover"
                                  draggable={false}
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                                  <ImageIcon className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground/50" />
                                </div>
                              )}
                              {isActive && <div className="absolute inset-0 bg-primary/10" />}
                            </div>
                            <div className="px-1.5 py-1 sm:px-2 sm:py-1.5 bg-card/80">
                              <p className={cn(
                                'text-[10px] sm:text-xs truncate text-center',
                                isActive ? 'text-primary font-medium' : 'text-foreground'
                              )}>
                                {album.name}
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
            {reelExpanded && (
              <div className="fixed inset-0 z-20" onClick={() => setReelExpanded(false)} aria-hidden="true" />
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
              {photosLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : photos.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  {t('noPhotosYet')}
                </div>
              ) : (
                <PhotoGrid
                  photos={photos}
                  buildPhotoUrl={buildPhotoUrl}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                  onPhotoClick={setLightboxIndex}
                  dense
                />
              )}
            </div>
          </div>
        </div>
        )
      })()}

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          buildPhotoUrl={buildPhotoUrl}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          canDownload={allowPhotoDownload}
        />
      )}
    </>
  )
}
