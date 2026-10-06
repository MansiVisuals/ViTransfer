'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Download, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface GalleryPhoto {
  id: string
  fileName: string
  fileSize: string
  width: number | null
  height: number | null
  hasThumbnail: boolean
  /** Direct rendition URL — presigned S3 object, or the token route in FS mode */
  thumbUrl: string | null
}

interface PhotoGridProps {
  photos: GalleryPhoto[]
  selectedIds: Set<string>
  onToggleSelect: (photoId: string) => void
  onPhotoClick: (index: number) => void
  /** Selection and per-photo download controls; both are hover-only, so touch screens get them from the lightbox instead */
  allowDownload?: boolean
  onDownloadPhoto?: (photoId: string) => void
  /** More, smaller columns for a grid that shares the page with other content */
  dense?: boolean
}

function columnsForWidth(width: number, dense: boolean): number {
  if (dense) {
    if (width < 640) return 3
    if (width < 1024) return 4
    if (width < 1536) return 6
    return 8
  }
  if (width < 640) return 2
  if (width < 1024) return 3
  if (width < 1536) return 4
  return 5
}

/** Height-to-width ratio; a photo without dimensions holds a square slot. */
function photoRatio(photo: GalleryPhoto): number {
  return photo.width && photo.height ? photo.height / photo.width : 1
}

/**
 * The photo grid every client sees, whether the link delivers photos alongside
 * videos or on its own. Keeps each photo's own proportions — a delivery is the
 * photographer's framing, not a uniform contact sheet.
 */
export default function PhotoGrid({
  photos,
  selectedIds,
  onToggleSelect,
  onPhotoClick,
  allowDownload = false,
  onDownloadPhoto,
  dense = false,
}: PhotoGridProps) {
  const t = useTranslations('photos')
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [columnCount, setColumnCount] = useState(dense ? 3 : 2)

  useEffect(() => {
    const node = gridRef.current
    if (!node) return
    const update = () => setColumnCount(columnsForWidth(node.clientWidth, dense))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [dense])

  // Greedy shortest-column placement keeps the reading order left to right and
  // stays stable while further pages are appended.
  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => ({ height: 0, items: [] as Array<{ photo: GalleryPhoto; index: number }> }))
    photos.forEach((photo, index) => {
      const shortest = cols.reduce((min, col) => (col.height < min.height ? col : min), cols[0])
      shortest.items.push({ photo, index })
      shortest.height += photoRatio(photo)
    })
    return cols
  }, [photos, columnCount])

  const selecting = selectedIds.size > 0
  const gap = dense ? 'gap-1.5' : 'gap-1.5 sm:gap-3'

  return (
    <div ref={gridRef} className={cn('flex', gap)}>
      {columns.map((column, columnIndex) => (
        <div key={columnIndex} className={cn('flex min-w-0 flex-1 flex-col', gap)}>
          {column.items.map(({ photo, index }) => {
            const isSelected = selectedIds.has(photo.id)
            return (
              <figure
                key={photo.id}
                className="group relative overflow-hidden bg-muted/50"
                style={{ aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : '1 / 1' }}
              >
                {photo.thumbUrl ? (
                  <button
                    type="button"
                    onClick={() => (selecting && allowDownload ? onToggleSelect(photo.id) : onPhotoClick(index))}
                    className={cn(
                      'block h-full w-full focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white',
                      selecting && allowDownload ? 'cursor-pointer' : 'cursor-zoom-in'
                    )}
                    aria-label={photo.fileName}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbUrl}
                      alt={photo.fileName}
                      loading="lazy"
                      decoding="async"
                      className={cn(
                        'h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out',
                        isSelected ? 'scale-[0.94]' : 'motion-safe:group-hover:scale-[1.015]'
                      )}
                    />
                  </button>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                    <ImageIcon className="h-5 w-5" />
                    <span className="text-xs">{t('processing')}</span>
                  </div>
                )}

                {allowDownload && photo.thumbUrl && (
                  <>
                    <div
                      className={cn(
                        'pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/25 opacity-0 motion-safe:transition-opacity motion-safe:duration-200 [@media(hover:none)]:hidden',
                        !isSelected && 'group-hover:opacity-100 group-has-[:focus-visible]:opacity-100'
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => onToggleSelect(photo.id)}
                      aria-pressed={isSelected}
                      aria-label={`${t('selectPhoto')}: ${photo.fileName}`}
                      className={cn(
                        'absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border motion-safe:transition-all motion-safe:duration-200 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring [@media(hover:none)]:hidden',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground opacity-100'
                          : cn(
                              'border-white/90 bg-black/10 text-transparent hover:bg-black/30',
                              selecting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100'
                            )
                      )}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </button>
                    {onDownloadPhoto && (
                      <button
                        type="button"
                        onClick={() => onDownloadPhoto(photo.id)}
                        aria-label={`${t('downloadPhoto')}: ${photo.fileName}`}
                        title={t('downloadPhoto')}
                        className="absolute bottom-2 right-2 p-1 text-white opacity-0 motion-safe:transition-opacity motion-safe:duration-200 hover:text-white/80 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 [@media(hover:none)]:hidden"
                      >
                        <Download className="h-4 w-4 drop-shadow" />
                      </button>
                    )}
                  </>
                )}
              </figure>
            )
          })}
        </div>
      ))}
    </div>
  )
}
