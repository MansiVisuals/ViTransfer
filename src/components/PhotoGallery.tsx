'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Image, Trash2, CheckCircle2, GripVertical, AlertCircle } from 'lucide-react'
import { cn, formatFileSize } from '@/lib/utils'
import { apiPatch, apiDelete } from '@/lib/api-client'

interface Photo {
  id: string
  name: string
  originalFileName: string
  originalFileSize: string | number
  mimeType: string
  width?: number | null
  height?: number | null
  sortOrder: number
  status: string
  approved: boolean
  approvedAt?: string | null
  originalStoragePath: string
}

interface PhotoGalleryProps {
  photos: Photo[]
  projectId: string
  isAdmin?: boolean
  onRefresh?: () => void
  onPhotoClick?: (index: number) => void
  contentTokens?: Record<string, string> // photoId -> content URL
}

export default function PhotoGallery({
  photos,
  projectId,
  isAdmin = false,
  onRefresh,
  onPhotoClick,
  contentTokens = {},
}: PhotoGalleryProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [dragItem, setDragItem] = useState<number | null>(null)
  const [dragOverItem, setDragOverItem] = useState<number | null>(null)

  const sortedPhotos = [...photos].sort((a, b) => a.sortOrder - b.sortOrder)
  const readyPhotos = sortedPhotos.filter(p => p.status === 'READY')
  const uploadingPhotos = sortedPhotos.filter(p => p.status === 'UPLOADING')
  const errorPhotos = sortedPhotos.filter(p => p.status === 'ERROR')

  const getPhotoUrl = (photo: Photo): string | null => {
    return contentTokens[photo.id] || null
  }

  const handleDelete = async (photoId: string) => {
    if (!confirm('Delete this photo?')) return
    setDeletingId(photoId)
    try {
      await apiDelete(`/api/photos/${photoId}`)
      onRefresh?.()
    } catch {
      // handled by apiDelete
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleApproval = async (photo: Photo) => {
    setTogglingId(photo.id)
    try {
      await apiPatch(`/api/photos/${photo.id}`, { approved: !photo.approved })
      onRefresh?.()
    } catch {
      // handled by apiPatch
    } finally {
      setTogglingId(null)
    }
  }

  const handleDragStart = (index: number) => {
    setDragItem(index)
  }

  const handleDragEnter = (index: number) => {
    setDragOverItem(index)
  }

  const handleDragEnd = async () => {
    if (dragItem === null || dragOverItem === null || dragItem === dragOverItem) {
      setDragItem(null)
      setDragOverItem(null)
      return
    }

    const reordered = [...readyPhotos]
    const [moved] = reordered.splice(dragItem, 1)
    reordered.splice(dragOverItem, 0, moved)

    // Update sort orders
    const updates = reordered.map((photo, index) => ({
      id: photo.id,
      sortOrder: index,
    }))

    setDragItem(null)
    setDragOverItem(null)

    try {
      await apiPatch('/api/photos/batch', { photos: updates })
      onRefresh?.()
    } catch {
      // handled by apiPatch
    }
  }

  if (photos.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Image className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">No photos uploaded yet</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Error photos */}
      {errorPhotos.length > 0 && (
        <div className="space-y-2">
          {errorPhotos.map(photo => (
            <div key={photo.id} className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="flex-1 text-sm truncate">{photo.originalFileName}</span>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(photo.id)}
                  disabled={deletingId === photo.id}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Uploading photos */}
      {uploadingPhotos.length > 0 && (
        <div className="space-y-2">
          {uploadingPhotos.map(photo => (
            <div key={photo.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card animate-pulse">
              <Image className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="flex-1 text-sm truncate text-muted-foreground">{photo.originalFileName} — Uploading...</span>
            </div>
          ))}
        </div>
      )}

      {/* Ready photos grid */}
      {readyPhotos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {readyPhotos.map((photo, index) => {
            const url = getPhotoUrl(photo)
            return (
              <div
                key={photo.id}
                className={cn(
                  'group relative rounded-lg border overflow-hidden bg-muted/30 cursor-pointer transition-all',
                  dragOverItem === index && 'ring-2 ring-primary',
                  photo.approved && 'ring-2 ring-green-500/50'
                )}
                draggable={isAdmin}
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => onPhotoClick?.(index)}
              >
                {/* Thumbnail */}
                <div className="aspect-square relative">
                  {url ? (
                    <img
                      src={url}
                      alt={photo.name}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Image className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                  )}

                  {/* Admin overlay */}
                  {isAdmin && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => handleToggleApproval(photo)}
                          disabled={togglingId === photo.id}
                          title={photo.approved ? 'Unapprove' : 'Approve'}
                        >
                          <CheckCircle2 className={cn('w-3.5 h-3.5', photo.approved && 'text-green-500')} />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => handleDelete(photo.id)}
                          disabled={deletingId === photo.id}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Drag handle */}
                  {isAdmin && (
                    <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <GripVertical className="w-4 h-4 text-white drop-shadow" />
                    </div>
                  )}

                  {/* Approval badge */}
                  {photo.approved && (
                    <div className="absolute top-1 right-1">
                      <CheckCircle2 className="w-4 h-4 text-green-500 drop-shadow" />
                    </div>
                  )}
                </div>

                {/* Caption */}
                <div className="px-2 py-1.5">
                  <p className="text-xs truncate font-medium">{photo.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatFileSize(Number(photo.originalFileSize))}
                    {photo.width && photo.height ? ` · ${photo.width}×${photo.height}` : ''}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
