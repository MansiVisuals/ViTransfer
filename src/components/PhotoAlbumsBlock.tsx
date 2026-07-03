'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import {
  ArrowLeft, Download, FolderPlus, ImageIcon, Loader2, Pencil, Plus, Trash2, Upload, X,
} from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import PhotoGrid, { GalleryPhoto } from './PhotoGrid'
import PhotoLightbox from './PhotoLightbox'
import { usePhotoUploadQueue } from '@/hooks/usePhotoUploadQueue'
import { apiFetch } from '@/lib/api-client'
import { ALLOWED_PHOTO_TYPES } from '@/lib/file-validation'
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

function isPhotoFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return ALLOWED_PHOTO_TYPES.extensions.includes(name.slice(name.lastIndexOf('.')))
}

// Recursively collect files from a drag-and-drop FileSystemEntry (file or directory)
async function entryToFiles(entry: any): Promise<File[]> {
  if (entry.isFile) {
    return new Promise(resolve => entry.file((f: File) => resolve([f]), () => resolve([])))
  }
  if (entry.isDirectory) {
    const reader = entry.createReader()
    const readBatch = (): Promise<any[]> =>
      new Promise(resolve => reader.readEntries(resolve, () => resolve([])))
    const entries: any[] = []
    let batch = await readBatch()
    while (batch.length > 0) {
      entries.push(...batch)
      batch = await readBatch()
    }
    const nested = await Promise.all(entries.map(entryToFiles))
    return nested.flat()
  }
  return []
}

export default function PhotoAlbumsBlock({ projectId, sortMode = 'date', onCountsChange }: PhotoAlbumsBlockProps) {
  const t = useTranslations('photos')
  const tc = useTranslations('common')

  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null)

  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [contentToken, setContentToken] = useState<string | null>(null)
  const [photosLoading, setPhotosLoading] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [albumName, setAlbumName] = useState('')
  const [savingAlbum, setSavingAlbum] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
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
      setSelectedIds(new Set())
      fetchPhotos(selectedAlbum.id)
    } else {
      setPhotos([])
      setContentToken(null)
      setSelectedIds(new Set())
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
        setSelectedIds(prev => { const next = new Set(prev); next.delete(photo.id); return next })
        fetchAlbums()
      }
    } catch (error) {
      logError('Error deleting photo:', error)
    } finally {
      setDeletingId(null)
    }
  }

  const handleZipDownload = async (scope: 'selection' | 'album') => {
    if (!selectedAlbum) return
    setDownloading(true)
    try {
      const res = await apiFetch(`/api/projects/${projectId}/photos/download-zip-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          scope === 'selection'
            ? { scope, albumId: selectedAlbum.id, photoIds: Array.from(selectedIds) }
            : { scope, albumId: selectedAlbum.id }
        ),
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
          <button
            type="button"
            onClick={() => uploadQueue.cancelUpload(upload.id)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            aria-label={tc('cancel')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  ) : null

  const dropZoneClassName = `rounded-lg transition-shadow ${isDragOver ? 'ring-2 ring-primary/60' : ''}`

  // ── Album detail view ─────────────────────────────────────────────────────
  if (selectedAlbum) {
    return (
      <div
        className={`space-y-3 ${dropZoneClassName}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleAlbumDrop}
      >
        {isDragOver && (
          <div className="px-3 py-2 rounded-lg border border-dashed border-primary/60 bg-primary/5 text-sm text-primary">
            {t('dropPhotosHint')}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedAlbum(null)} className="px-2">
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t('backToAlbums')}
          </Button>
          <p className="font-medium truncate min-w-0">{selectedAlbum.name}</p>
          <button
            type="button"
            onClick={() => { setAlbumName(selectedAlbum.name); setRenameOpen(true) }}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={t('renameAlbum')}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleDeleteAlbum}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
            title={t('deleteAlbum')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          {selectedIds.size > 0 && (
            <Button variant="outline" size="sm" onClick={() => handleZipDownload('selection')} disabled={downloading}>
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin sm:mr-1" /> : <Download className="w-3.5 h-3.5 sm:mr-1" />}
              <span className="hidden sm:inline">{t('downloadSelected', { count: selectedIds.size })}</span>
              <span className="sm:hidden">{selectedIds.size}</span>
            </Button>
          )}
          {photos.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => handleZipDownload('album')} disabled={downloading}>
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin sm:mr-1" /> : <Download className="w-3.5 h-3.5 sm:mr-1" />}
              <span className="hidden sm:inline">{t('downloadAlbum')}</span>
            </Button>
          )}
          <Button variant="default" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5 sm:mr-1" />
            <span className="hidden sm:inline">{t('uploadPhotos')}</span>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={PHOTO_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
        </div>

        {uploadRows}

        {photosLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : photos.length === 0 && activeUploads.length === 0 ? (
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
            onDelete={handleDeletePhoto}
            deletingId={deletingId}
            coverPhotoId={selectedAlbum.coverPhotoId}
            onSetCover={handleSetCover}
          />
        )}

        {lightboxIndex !== null && (
          <PhotoLightbox
            photos={photos}
            index={lightboxIndex}
            buildPhotoUrl={buildPhotoUrl}
            onClose={() => setLightboxIndex(null)}
            onNavigate={setLightboxIndex}
            canDownload
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
      </div>
    )
  }

  // ── Albums overview ───────────────────────────────────────────────────────
  const sortedAlbums = sortMode === 'alphabetical'
    ? [...albums].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    : albums // API returns createdAt ascending

  return (
    <div
      className={`space-y-3 ${dropZoneClassName}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleOverviewDrop}
    >
      {isDragOver && (
        <div className="px-3 py-2 rounded-lg border border-dashed border-primary/60 bg-primary/5 text-sm text-primary">
          {t('dropFoldersHint')}
        </div>
      )}
      {uploadRows}
      {albums.length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <p className="text-sm text-muted-foreground">{t('noAlbumsYet')}</p>
          <Button variant="outline" size="sm" onClick={() => { setAlbumName(''); setCreateOpen(true) }}>
            <FolderPlus className="w-3.5 h-3.5 mr-1" />
            {t('createAlbum')}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedAlbums.map(album => (
            <button
              key={album.id}
              type="button"
              onClick={() => setSelectedAlbum(album)}
              className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors text-left"
            >
              {album.coverPhotoId && album.contentToken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/content/photo/${album.contentToken}?photoId=${album.coverPhotoId}&variant=thumb`}
                  alt={album.name}
                  loading="lazy"
                  className="w-14 h-8 rounded object-cover border border-border bg-muted flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-8 rounded border border-border bg-muted flex items-center justify-center flex-shrink-0">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{album.name}</p>
                <p className="text-xs text-muted-foreground">{t('photoCount', { count: album.photoCount })}</p>
              </div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setAlbumName(''); setCreateOpen(true) }}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-dashed bg-card hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            <div className="w-14 h-8 rounded border border-dashed border-border flex items-center justify-center flex-shrink-0">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium">{t('createAlbum')}</span>
          </button>
        </div>
      )}

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
