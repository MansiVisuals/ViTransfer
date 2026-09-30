'use client'

import { useState, useEffect, useCallback, useRef, type RefObject } from 'react'
import type { GalleryPhoto } from '@/components/PhotoGrid'
import { apiFetch } from '@/lib/api-client'
import { logError } from '@/lib/logging'

/** Matches the server page size — one request per grid page. */
const PHOTO_PAGE_SIZE = 200

interface GalleryAlbum {
  id: string
  name: string
  photoCount: number
  coverPhotoId: string | null
  contentToken: string | null
}

export type PhotoZipScope = 'selection' | 'album' | 'project'

interface UseAlbumGalleryOptions {
  /** Omit when the viewer has no album access; the gallery then stays empty */
  projectId?: string
  /** Share bearer token; omit for admin sessions (uses apiFetch instead) */
  shareToken?: string
  /** Reports the album count once albums load */
  onAlbumCount?: (count: number) => void
  /** Scroll container of the photo grid, so pages are prefetched before they come into view */
  scrollRootRef?: RefObject<HTMLElement | null>
}

/** Hands a URL to the browser as a download without navigating away. */
function triggerDownload(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = ''
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/**
 * Client-facing album data: album list, the paged photo grid of the open
 * album, photo URLs and zip downloads. Shared by the share page photo section
 * and the photo delivery gallery (and their admin previews).
 */
export function useAlbumGallery({ projectId, shareToken, onAlbumCount, scrollRootRef }: UseAlbumGalleryOptions) {
  const [albums, setAlbums] = useState<GalleryAlbum[]>([])
  const [albumsLoading, setAlbumsLoading] = useState(true)
  const [selectedAlbum, setSelectedAlbum] = useState<GalleryAlbum | null>(null)

  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [contentToken, setContentToken] = useState<string | null>(null)
  const [photosLoading, setPhotosLoading] = useState(false)
  const [totalPhotos, setTotalPhotos] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const loadingPageRef = useRef(false)
  // Bumped on every album change: requests from an earlier album neither land
  // nor release the loading lock the new album's first page now holds
  const generationRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

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
    if (!projectId) {
      setAlbums([])
      setAlbumsLoading(false)
      return
    }
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
      setAlbumsLoading(false)
    }
  }, [projectId, doFetch, onAlbumCount])

  const fetchPhotoPage = useCallback(async (albumId: string, offset: number) => {
    if (loadingPageRef.current) return
    loadingPageRef.current = true
    const generation = generationRef.current
    if (offset === 0) setPhotosLoading(true)
    try {
      const res = await doFetch(
        `/api/projects/${projectId}/photo-albums/${albumId}/photos?offset=${offset}&limit=${PHOTO_PAGE_SIZE}`
      )
      if (!res.ok) return
      const data = await res.json()
      // Drop a page that landed after the viewer moved to another album
      if (generation !== generationRef.current) return
      setContentToken(data.contentToken || null)
      setTotalPhotos(data.total || 0)
      setPhotos(prev => (offset === 0 ? data.photos || [] : [...prev, ...(data.photos || [])]))
    } catch (error) {
      logError('Error fetching photos:', error)
    } finally {
      if (generation === generationRef.current) {
        loadingPageRef.current = false
        if (offset === 0) setPhotosLoading(false)
      }
    }
  }, [projectId, doFetch])

  useEffect(() => {
    fetchAlbums()
  }, [fetchAlbums])

  useEffect(() => {
    generationRef.current += 1
    loadingPageRef.current = false
    setPhotos([])
    setTotalPhotos(0)
    if (selectedAlbum) {
      fetchPhotoPage(selectedAlbum.id, 0)
    } else {
      setContentToken(null)
      setPhotosLoading(false)
    }
  }, [selectedAlbum, fetchPhotoPage])

  // Pull the next page as the sentinel nears the viewport. Re-running on
  // photos.length re-observes an already-visible sentinel, so a page that was
  // skipped while another was in flight is picked straight back up.
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !selectedAlbum || photos.length >= totalPhotos) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) fetchPhotoPage(selectedAlbum.id, photos.length)
      },
      // The grid scrolls inside its own container, which clips the sentinel
      // for a viewport root: observe against that container instead
      { root: scrollRootRef?.current ?? null, rootMargin: '600px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [selectedAlbum, photos.length, totalPhotos, fetchPhotoPage, scrollRootRef])

  /** Fetch the next page ahead of time (the lightbox pages past the loaded grid) */
  const loadMore = useCallback(() => {
    if (selectedAlbum && photos.length < totalPhotos) fetchPhotoPage(selectedAlbum.id, photos.length)
  }, [selectedAlbum, photos.length, totalPhotos, fetchPhotoPage])

  const buildPhotoUrl = useCallback((photoId: string, variant: 'thumb' | 'full') => {
    return `/api/content/photo/${contentToken}?photoId=${photoId}&variant=${variant}`
  }, [contentToken])

  const downloadPhoto = useCallback((photoId: string) => {
    triggerDownload(`${buildPhotoUrl(photoId, 'full')}&download=true`)
  }, [buildPhotoUrl])

  const downloadZip = useCallback(async (scope: PhotoZipScope, photoIds: string[] = []) => {
    setDownloading(true)
    try {
      const body =
        scope === 'selection' && selectedAlbum
          ? { scope, albumId: selectedAlbum.id, photoIds }
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
      triggerDownload(url)
    } catch (error) {
      logError('Error downloading photos:', error)
    } finally {
      setDownloading(false)
    }
  }, [projectId, doFetch, selectedAlbum])

  return {
    albums,
    albumsLoading,
    selectedAlbum,
    setSelectedAlbum,
    photos,
    totalPhotos,
    photosLoading,
    sentinelRef,
    loadMore,
    buildPhotoUrl,
    downloadPhoto,
    downloadZip,
    downloading,
  }
}
