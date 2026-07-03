'use client'

import { useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import type { GalleryPhoto } from './PhotoGrid'

interface PhotoLightboxProps {
  photos: GalleryPhoto[]
  index: number
  buildPhotoUrl: (photoId: string, variant: 'thumb' | 'full') => string
  onClose: () => void
  onNavigate: (index: number) => void
  canDownload: boolean
}

export default function PhotoLightbox({
  photos,
  index,
  buildPhotoUrl,
  onClose,
  onNavigate,
  canDownload,
}: PhotoLightboxProps) {
  const t = useTranslations('photos')
  const photo = photos[index]

  const goPrev = useCallback(() => {
    onNavigate(index > 0 ? index - 1 : photos.length - 1)
  }, [index, photos.length, onNavigate])

  const goNext = useCallback(() => {
    onNavigate(index < photos.length - 1 ? index + 1 : 0)
  }, [index, photos.length, onNavigate])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, goPrev, goNext])

  if (!photo) return null

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = `${buildPhotoUrl(photo.id, 'full')}&download=true`
    a.download = ''
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border flex-shrink-0">
        <p className="text-sm font-medium truncate min-w-0">
          {photo.fileName}
          <span className="ml-2 text-xs text-muted-foreground">{index + 1} / {photos.length}</span>
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canDownload && (
            <button
              type="button"
              onClick={handleDownload}
              className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title={t('downloadPhoto')}
              aria-label={t('downloadPhoto')}
            >
              <Download className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 relative min-h-0 flex items-center justify-center p-4" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={buildPhotoUrl(photo.id, 'full')}
          alt={photo.fileName}
          className="max-w-full max-h-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />

        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goPrev() }}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/70 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('previousPhoto')}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goNext() }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/70 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('nextPhoto')}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
