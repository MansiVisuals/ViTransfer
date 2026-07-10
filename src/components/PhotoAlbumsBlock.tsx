'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FolderPlus, ImageIcon, Loader2, Pencil, Plus, Star, Trash2, Upload, X,
} from 'lucide-react'
import { formatFileSize } from '@/lib/utils'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import type { GalleryPhoto } from './PhotoGrid'
import PhotoLightbox from './PhotoLightbox'
import { usePhotoUploadQueue } from '@/hooks/usePhotoUploadQueue'
import { apiFetch } from '@/lib/api-client'
import { ALLOWED_PHOTO_TYPES } from '@/lib/file-validation'
import { entryToFiles } from '@/lib/drop-entries'
import { logError } from '@/lib/logging'

interface Album {
  id: string
  name: string
  photoCount: number
  coverPhotoId: string | null
  contentToken: string | null
  createdAt: string
}

interface PhotoAlbumsBlockProps {
  projectId: string
  sortMode?: 'date' | 'alphabetical'
  onCountsChange?: (albumCount: number, photoCount: number) => void
}

const PHOTO_ACCEPT = ALLOWED_PHOTO_TYPES.extensions.join(',')
const PHOTO_PAGE_SIZE = 10

function isPhotoFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return ALLOWED_PHOTO_TYPES.extensions.includes(name.slice(name.lastIndexOf('.')))
}

export default function PhotoAlbumsBlock({ projectId, sortMode = 'date', onCountsChange }: PhotoAlbumsBlockProps) {
  const t = useTranslations('photos')
  const tc = useTranslations('common')

  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)

  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [photoPage, setPhotoPage] = useState(0)
  const [contentToken, setContentToken] = useState<string | null>(null)
  const [photosLoading, setPhotosLoading] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [albumName, setAlbumName] = useState('')
  const [savingAlbum, setSavingAlbum] = useState(false)

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)
  // Album deep-link (?album=...) captured before any URL syncing happens
  const pendingAlbumRef = useRef<string | null>(
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('album') : null
  )

  const fetchAlbums = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/photo-albums`)
      if (res.ok) {
        const data = await res.json()
        setAlbums(data.albums || [])
      }
    } catch (error) {
      logError('Error fetching photo albums:', error)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const fetchPhotos = useCallback(async (albumId: string) => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/photo-albums/${albumId}/photos`)
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
  }, [projectId])

  useEffect(() => {
    fetchAlbums()
  }, [fetchAlbums])

  useEffect(() => {
    if (!loading) {
      onCountsChange?.(albums.length, albums.reduce((sum, a) => sum + a.photoCount, 0))
    }
  }, [albums, loading, onCountsChange])

  // Restore album from ?album= deep link once albums are loaded
  useEffect(() => {
    if (loading || !pendingAlbumRef.current) return
    const target = albums.find(a => a.id === pendingAlbumRef.current)
    pendingAlbumRef.current = null
    if (target) setSelectedAlbum(target)
  }, [loading, albums])

  // Keep ?album= in sync with the open album (survives refresh)
  useEffect(() => {
    if (pendingAlbumRef.current) return
    const url = new URL(window.location.href)
    if (selectedAlbum) url.searchParams.set('album', selectedAlbum.id)
    else url.searchParams.delete('album')
    window.history.replaceState(null, '', url.toString())
  }, [selectedAlbum])

  useEffect(() => {
    if (selectedAlbum) {
      setPhotosLoading(true)
      fetchPhotos(selectedAlbum.id)
    } else {
      setPhotos([])
      setContentToken(null)
    }
  }, [selectedAlbum, fetchPhotos])

  // Poll while thumbnails are still being generated
  useEffect(() => {
    if (!selectedAlbum || !photos.some(p => !p.hasThumbnail)) return
    const interval = setInterval(() => fetchPhotos(selectedAlbum.id), 4000)
    return () => clearInterval(interval)
  }, [selectedAlbum, photos, fetchPhotos])

  const handleUploadComplete = useCallback(() => {
    if (selectedAlbum) fetchPhotos(selectedAlbum.id)
    fetchAlbums()
  }, [selectedAlbum, fetchPhotos, fetchAlbums])

  const uploadQueue = usePhotoUploadQueue({
    projectId,
    albumId: selectedAlbum?.id || '',
    onUploadComplete: handleUploadComplete,
  })

  const buildPhotoUrl = useCallback((photoId: string, variant: 'thumb' | 'full') => {
    return `/api/content/photo/${contentToken}?photoId=${photoId}&variant=${variant}`
  }, [contentToken])

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(file => uploadQueue.addToQueue(file))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCreateAlbum = async () => {
    if (!albumName.trim()) return
    setSavingAlbum(true)
    try {
      const res = await apiFetch(`/api/projects/${projectId}/photo-albums`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: albumName.trim() }),
      })
      if (res.ok) {
        setCreateOpen(false)
        setAlbumName('')
        await fetchAlbums()
      }
    } catch (error) {
      logError('Error creating album:', error)
    } finally {
      setSavingAlbum(false)
    }
  }

  const handleRenameAlbum = async () => {
    if (!selectedAlbum || !albumName.trim()) return
    setSavingAlbum(true)
    try {
      const res = await apiFetch(`/api/projects/${projectId}/photo-albums/${selectedAlbum.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: albumName.trim() }),
      })
      if (res.ok) {
        setRenameOpen(false)
        setSelectedAlbum(prev => prev ? { ...prev, name: albumName.trim() } : prev)
        setAlbumName('')
        await fetchAlbums()
      }
    } catch (error) {
      logError('Error renaming album:', error)
    } finally {
      setSavingAlbum(false)
    }
  }

  const handleDeleteAlbum = async () => {
    if (!selectedAlbum) return
    if (!confirm(t('confirmDeleteAlbum'))) return
    try {
      const res = await apiFetch(`/api/projects/${projectId}/photo-albums/${selectedAlbum.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setSelectedAlbum(null)
        await fetchAlbums()
      }
    } catch (error) {
      logError('Error deleting album:', error)
    }
  }

  const handleSetCover = async (photo: GalleryPhoto) => {
    if (!selectedAlbum) return
    try {
      const res = await apiFetch(`/api/projects/${projectId}/photo-albums/${selectedAlbum.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverPhotoId: photo.id }),
      })
      if (res.ok) {
        setSelectedAlbum(prev => prev ? { ...prev, coverPhotoId: photo.id } : prev)
        fetchAlbums()
      }
    } catch (error) {
      logError('Error setting album cover:', error)
    }
  }

  const handleDeletePhoto = async (photo: GalleryPhoto) => {
    if (!selectedAlbum) return
    if (!confirm(t('confirmDeletePhoto'))) return
    setDeletingId(photo.id)
    try {
      const res = await apiFetch(
        `/api/projects/${projectId}/photo-albums/${selectedAlbum.id}/photos/${photo.id}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        setPhotos(prev => prev.filter(p => p.id !== photo.id))
        fetchAlbums()
      }
    } catch (error) {
      logError('Error deleting photo:', error)
    } finally {
      setDeletingId(null)
    }
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current += 1
    setIsDragOver(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current -= 1
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragOver(false)
    }
  }

  // Drop onto an open album: upload all photo files (folders are flattened)
  const handleAlbumDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragOver(false)
    if (!selectedAlbum) return

    // webkitGetAsEntry must be read synchronously before any await
    const entries = Array.from(e.dataTransfer.items || [])
      .map(item => (item as any).webkitGetAsEntry?.())
      .filter(Boolean)

    const files = entries.length > 0
      ? (await Promise.all(entries.map(entryToFiles))).flat()
      : Array.from(e.dataTransfer.files || [])

    files.filter(isPhotoFile).forEach(file => uploadQueue.addToQueue(file, selectedAlbum.id))
  }

  // Drop folders onto the overview: one album per folder, photos uploaded into it
  const handleOverviewDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragOver(false)

    const entries = Array.from(e.dataTransfer.items || [])
      .map(item => (item as any).webkitGetAsEntry?.())
      .filter(Boolean)
    const dirEntries = entries.filter((entry: any) => entry.isDirectory)

    let createdAny = false
    for (const dir of dirEntries) {
      const files = (await entryToFiles(dir)).filter(isPhotoFile)
      if (files.length === 0) continue
      try {
        const res = await apiFetch(`/api/projects/${projectId}/photo-albums`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: dir.name }),
        })
        if (!res.ok) continue
        const { album } = await res.json()
        files.forEach(file => uploadQueue.addToQueue(file, album.id))
        createdAny = true
      } catch (error) {
        logError('Error creating album from folder:', error)
      }
    }
    if (createdAny) await fetchAlbums()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const activeUploads = uploadQueue.queue.filter(u => u.status !== 'completed')

  const uploadRows = activeUploads.length > 0 ? (
    <div className="space-y-1.5">
      {activeUploads.map(upload => (
        <div key={upload.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card text-sm">
          <ImageIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="truncate min-w-0 flex-1">{upload.file.name}</span>
          {upload.status === 'error' ? (
            <span className="text-xs text-destructive truncate max-w-[50%]">{upload.error}</span>
          ) : (
            <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden flex-shrink-0">
              <div className="h-full bg-primary transition-all" style={{ width: `${upload.progress}%` }} />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
            onClick={() => uploadQueue.cancelUpload(upload.id)}
            aria-label={tc('cancel')}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
    </div>
  ) : null

  const dropZoneClassName = `rounded-lg transition-shadow ${isDragOver ? 'ring-2 ring-primary/60' : ''}`

  // ── Albums (accordion) ─────────────────────────────────────────────────────
  const sortedAlbums = sortMode === 'alphabetical'
    ? [...albums].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    : albums // API returns createdAt ascending

  const pageCount = Math.ceil(photos.length / PHOTO_PAGE_SIZE)
  const currentPage = Math.min(photoPage, Math.max(0, pageCount - 1))
  const pagePhotos = photos.slice(currentPage * PHOTO_PAGE_SIZE, (currentPage + 1) * PHOTO_PAGE_SIZE)

  return (
    <div
      className={`space-y-4 ${dropZoneClassName}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={selectedAlbum ? handleAlbumDrop : handleOverviewDrop}
    >
      {isDragOver && (
        <div className="px-3 py-2 rounded-lg border border-dashed border-primary/60 bg-primary/5 text-sm text-primary">
          {selectedAlbum ? t('dropPhotosHint') : t('dropFoldersHint')}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />
      {!selectedAlbum && uploadRows}
      {albums.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('noAlbumsYet')}</p>
            <Button variant="outline" size="sm" onClick={() => { setAlbumName(''); setCreateOpen(true) }}>
              <FolderPlus className="w-3.5 h-3.5 mr-1" />
              {t('createAlbum')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {sortedAlbums.map(album => {
            const isExpanded = selectedAlbum?.id === album.id
            return (
              <Card key={album.id} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer hover:bg-accent/50 transition-colors flex flex-row items-center justify-between space-y-0 py-3 px-3 sm:px-6"
                  onClick={() => { setSelectedAlbum(isExpanded ? null : album); setPhotoPage(0) }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {album.coverPhotoId && album.contentToken ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/content/photo/${album.contentToken}?photoId=${album.coverPhotoId}&variant=thumb`}
                        alt={album.name}
                        loading="lazy"
                        className="w-20 h-12 rounded-md object-cover border border-border bg-muted flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-12 rounded-md border border-border bg-muted flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg">{album.name}</CardTitle>
                        {isExpanded && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary-visible flex-shrink-0"
                              onClick={(e) => { e.stopPropagation(); setAlbumName(album.name); setRenameOpen(true) }}
                              title={t('renameAlbum')}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive-visible flex-shrink-0"
                              onClick={(e) => { e.stopPropagation(); handleDeleteAlbum() }}
                              title={t('deleteAlbum')}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{t('photoCount', { count: album.photoCount })}</p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    )}
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="border-t border-border pt-4 px-3 sm:px-6 space-y-3">
                    {uploadRows}

                    {photosLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : photos.length === 0 && activeUploads.length === 0 ? (
                      <div className="text-center py-8 space-y-3">
                        <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">{t('noPhotosYet')}</p>
                        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="w-3.5 h-3.5 mr-1" />
                          {t('uploadPhotos')}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pagePhotos.map((photo, index) => {
                          const isCover = selectedAlbum?.coverPhotoId === photo.id
                          return (
                            <div
                              key={photo.id}
                              className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                            >
                              <button
                                type="button"
                                onClick={() => setLightboxIndex(currentPage * PHOTO_PAGE_SIZE + index)}
                                className="flex-shrink-0 cursor-zoom-in"
                                aria-label={photo.fileName}
                              >
                                {photo.hasThumbnail ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={buildPhotoUrl(photo.id, 'thumb')}
                                    alt={photo.fileName}
                                    loading="lazy"
                                    className="w-20 h-12 rounded-md object-cover border border-border bg-muted"
                                  />
                                ) : (
                                  <div className="w-20 h-12 rounded-md border border-border bg-muted flex items-center justify-center">
                                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                  </div>
                                )}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{photo.fileName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatFileSize(Number(photo.fileSize))}
                                  {photo.width && photo.height ? ` • ${photo.width}×${photo.height}` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {photo.hasThumbnail && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-7 w-7 ${isCover ? 'text-primary hover:text-primary hover:bg-primary-visible' : 'text-muted-foreground hover:text-foreground'}`}
                                    onClick={() => handleSetCover(photo)}
                                    title={t('setAsCover')}
                                    aria-label={t('setAsCover')}
                                  >
                                    <Star className={`w-4 h-4 ${isCover ? 'fill-current' : ''}`} />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive-visible"
                                  onClick={() => handleDeletePhoto(photo)}
                                  disabled={deletingId === photo.id}
                                  title={t('deletePhoto')}
                                  aria-label={t('deletePhoto')}
                                >
                                  {deletingId === photo.id
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <Trash2 className="w-4 h-4" />}
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                        {pageCount > 1 && (
                          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={currentPage === 0}
                              onClick={() => setPhotoPage(currentPage - 1)}
                              aria-label={t('previousPage')}
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span>{currentPage + 1} / {pageCount}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={currentPage >= pageCount - 1}
                              onClick={() => setPhotoPage(currentPage + 1)}
                              aria-label={t('nextPage')}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full flex items-center gap-3 p-3 rounded-lg border border-dashed bg-card hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <div className="w-20 h-12 rounded-md border border-dashed border-border flex items-center justify-center flex-shrink-0">
                            <Upload className="w-5 h-5" />
                          </div>
                          <span className="text-sm font-medium">{t('uploadPhotos')}</span>
                        </button>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
          <button
            type="button"
            onClick={() => { setAlbumName(''); setCreateOpen(true) }}
            className="w-full flex items-center gap-3 py-3 px-3 sm:px-6 rounded-lg border border-dashed bg-card hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            <div className="w-20 h-12 rounded-md border border-dashed border-border flex items-center justify-center flex-shrink-0">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">{t('createAlbum')}</span>
          </button>
        </>
      )}

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          buildPhotoUrl={buildPhotoUrl}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          canDownload={false}
        />
      )}

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title={t('renameAlbum')}
        value={albumName}
        onValueChange={setAlbumName}
        onSave={handleRenameAlbum}
        saving={savingAlbum}
        saveLabel={tc('save')}
      />
      <RenameDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t('createAlbum')}
        value={albumName}
        onValueChange={setAlbumName}
        onSave={handleCreateAlbum}
        saving={savingAlbum}
        saveLabel={tc('create')}
      />
    </div>
  )
}

interface RenameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  value: string
  onValueChange: (value: string) => void
  onSave: () => void
  saving: boolean
  saveLabel: string
}

function RenameDialog({ open, onOpenChange, title, value, onValueChange, onSave, saving, saveLabel }: RenameDialogProps) {
  const t = useTranslations('photos')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={t('albumNamePlaceholder')}
          maxLength={100}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && value.trim() && !saving) onSave() }}
        />
        <DialogFooter>
          <Button variant="default" onClick={onSave} disabled={saving || !value.trim()}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
