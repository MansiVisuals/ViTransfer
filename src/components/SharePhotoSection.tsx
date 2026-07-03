'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Download, ImageIcon, Images, Loader2 } from 'lucide-react'
import PhotoGrid, { GalleryPhoto } from './PhotoGrid'
import PhotoLightbox from './PhotoLightbox'
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
}

/**
 * Client-facing photo gallery on the share page: album cards, photo grid,
 * lightbox, and zip downloads (selection / album / all albums).
 * Also used on the admin share preview (without a share token).
 */
export default function SharePhotoSection({ projectId, shareToken, allowPhotoDownload }: SharePhotoSectionProps) {
  const t = useTranslations('photos')

  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)

  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [contentToken, setContentToken] = useState<string | null>(null)
  const [photosLoading, setPhotosLoading] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [downloading, setDownloading] = useState(false)

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
      }
    } catch (error) {
      logError('Error fetching photo albums:', error)
    } finally {
      setLoading(false)
    }
  }, [projectId, doFetch])

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

  const downloadButtonClass = 'p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors flex items-center gap-1.5 disabled:opacity-50 text-sm font-medium text-foreground'

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 min-w-0">
          <Images className="w-5 h-5 text-primary flex-shrink-0" />
          {selectedAlbum ? (
            <span className="truncate">{selectedAlbum.name}</span>
          ) : (
            t('photos')
          )}
        </h2>
        <div className="flex-1" />
        {selectedAlbum ? (
          <>
            {allowPhotoDownload && selectedIds.size > 0 && (
              <button type="button" onClick={() => handleZipDownload('selection')} disabled={downloading} className={downloadButtonClass}>
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="hidden sm:inline">{t('downloadSelected', { count: selectedIds.size })}</span>
              </button>
            )}
            {allowPhotoDownload && photos.length > 0 && (
              <button type="button" onClick={() => handleZipDownload('album')} disabled={downloading} className={downloadButtonClass}>
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                <span className="hidden sm:inline">{t('downloadAlbum')}</span>
              </button>
            )}
            <button type="button" onClick={() => setSelectedAlbum(null)} className={downloadButtonClass}>
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{t('backToAlbums')}</span>
            </button>
          </>
        ) : (
          allowPhotoDownload && albums.length > 1 && (
            <button type="button" onClick={() => handleZipDownload('project')} disabled={downloading} className={downloadButtonClass}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline">{t('downloadAllAlbums')}</span>
            </button>
          )
        )}
      </div>

      {selectedAlbum ? (
        photosLoading ? (
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
          />
        )
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {albums.map(album => (
            <button
              key={album.id}
              type="button"
              onClick={() => setSelectedAlbum(album)}
              className="group text-left rounded-lg border bg-card overflow-hidden hover:bg-muted/30 transition-colors"
            >
              <div className="aspect-square bg-muted/40 flex items-center justify-center overflow-hidden">
                {album.coverPhotoId && album.contentToken ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/content/photo/${album.contentToken}?photoId=${album.coverPhotoId}&variant=thumb`}
                    alt={album.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <ImageIcon className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="px-3 py-2">
                <p className="text-sm font-medium truncate">{album.name}</p>
                <p className="text-xs text-muted-foreground">{t('photoCount', { count: album.photoCount })}</p>
              </div>
            </button>
          ))}
        </div>
      )}

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
    </div>
  )
}
