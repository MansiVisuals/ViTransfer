'use client'

import { useTranslations } from 'next-intl'
import { CheckSquare, Square, ImageIcon, Loader2, Star, Trash2 } from 'lucide-react'

export interface GalleryPhoto {
  id: string
  fileName: string
  fileSize: string
  width: number | null
  height: number | null
  hasThumbnail: boolean
}

interface PhotoGridProps {
  photos: GalleryPhoto[]
  buildPhotoUrl: (photoId: string, variant: 'thumb' | 'full') => string
  selectedIds: Set<string>
  onToggleSelect: (photoId: string) => void
  onPhotoClick: (index: number) => void
  onDelete?: (photo: GalleryPhoto) => void
  deletingId?: string | null
  /** Admin only: current album cover + setter (shows a star action per photo) */
  coverPhotoId?: string | null
  onSetCover?: (photo: GalleryPhoto) => void
}

export default function PhotoGrid({
  photos,
  buildPhotoUrl,
  selectedIds,
  onToggleSelect,
  onPhotoClick,
  onDelete,
  deletingId,
  coverPhotoId,
  onSetCover,
}: PhotoGridProps) {
  const t = useTranslations('photos')

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
      {photos.map((photo, index) => {
        const isSelected = selectedIds.has(photo.id)
        return (
          <div
            key={photo.id}
            className={`group relative aspect-square rounded-lg border bg-card overflow-hidden ${isSelected ? 'ring-2 ring-primary' : ''}`}
          >
            {photo.hasThumbnail ? (
              <button
                type="button"
                onClick={() => onPhotoClick(index)}
                className="w-full h-full block cursor-zoom-in"
                aria-label={photo.fileName}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={buildPhotoUrl(photo.id, 'thumb')}
                  alt={photo.fileName}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </button>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
                <ImageIcon className="w-6 h-6" />
                <span className="text-xs">{t('processing')}</span>
              </div>
            )}

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSelect(photo.id) }}
              className={`absolute top-1.5 left-1.5 p-1 rounded-md bg-background/70 backdrop-blur-sm transition-opacity ${isSelected ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground'}`}
              aria-label={t('selectPhoto')}
            >
              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            </button>

            {(onDelete || onSetCover) && (
              <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                {onSetCover && photo.hasThumbnail && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSetCover(photo) }}
                    className={`p-1 rounded-md bg-background/70 backdrop-blur-sm transition-opacity ${coverPhotoId === photo.id ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground'}`}
                    title={t('setAsCover')}
                    aria-label={t('setAsCover')}
                  >
                    <Star className={`w-4 h-4 ${coverPhotoId === photo.id ? 'fill-current' : ''}`} />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(photo) }}
                    disabled={deletingId === photo.id}
                    className="p-1 rounded-md bg-background/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity disabled:opacity-50"
                    aria-label={t('deletePhoto')}
                  >
                    {deletingId === photo.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
              </div>
            )}

            <div className="absolute bottom-0 inset-x-0 px-2 py-1 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <p className="text-xs truncate text-foreground">{photo.fileName}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
