'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import type { GalleryPhoto } from './PhotoGrid'
import { cn } from '@/lib/utils'

interface PhotoLightboxProps {
  photos: GalleryPhoto[]
  index: number
  buildPhotoUrl: (photoId: string, variant: 'thumb' | 'full') => string
  onClose: () => void
  onNavigate: (index: number) => void
  canDownload: boolean
  /** Photos in the whole album when only some pages are loaded; the counter shows it and navigation waits for the next page instead of wrapping */
  total?: number
  /** Called while browsing the last few loaded photos, so the host can fetch the next page */
  onNearEnd?: () => void
  /** 'gallery' drops the file name and chrome for a plain, solid backdrop (photo delivery page) */
  variant?: 'default' | 'gallery'
}

export default function PhotoLightbox({
  photos,
  index,
  buildPhotoUrl,
  onClose,
  onNavigate,
  canDownload,
  total,
  onNearEnd,
  variant = 'default',
}: PhotoLightboxProps) {
  const t = useTranslations('photos')
  const photo = photos[index]
  const isGallery = variant === 'gallery'
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const count = Math.max(total ?? 0, photos.length)

  const goPrev = useCallback(() => {
    if (index > 0) onNavigate(index - 1)
    else if (photos.length >= count) onNavigate(photos.length - 1)
  }, [index, photos.length, count, onNavigate])

  const goNext = useCallback(() => {
    if (index < photos.length - 1) onNavigate(index + 1)
    else if (photos.length >= count) onNavigate(0)
  }, [index, photos.length, count, onNavigate])

  useEffect(() => {
    if (onNearEnd && index >= photos.length - 5) onNearEnd()
  }, [index, photos.length, onNearEnd])

  // Horizontal swipes belong to the lightbox: stop the browser's swipe-back navigation meanwhile
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.overscrollBehaviorX
    root.style.overscrollBehaviorX = 'none'
    return () => { root.style.overscrollBehaviorX = previous }
  }, [])

  // Move focus into the dialog and hand it back to the opener on close
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => opener?.focus?.()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'Tab' && dialogRef.current) {
        // Keep Tab inside the dialog
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button'))
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        } else if (!dialogRef.current.contains(document.activeElement)) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, goPrev, goNext])

  // Horizontal one-finger swipe on touch screens flips photos; pinch and vertical movement are left alone
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches.length === 1 ? e.touches[0] : null
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    const touch = e.changedTouches[0]
    if (!start || !touch || e.touches.length > 0 || photos.length < 2) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx < 0) goNext()
    else goPrev()
  }

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

  const iconButtonClass = isGallery
    ? 'p-2 rounded-md hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors'
    : 'p-2 rounded-lg hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors'
  const arrowClass = isGallery
    ? 'absolute top-1/2 -translate-y-1/2 p-3 text-muted-foreground hover:text-foreground transition-colors'
    : 'absolute top-1/2 -translate-y-1/2 p-2 rounded-full bg-background/70 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground transition-colors'
  const arrowIconClass = isGallery ? 'w-7 h-7' : 'w-5 h-5'

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={photo.fileName}
      className={cn(
        'fixed inset-0 z-50 flex flex-col',
        isGallery ? 'bg-white dark:bg-neutral-950' : 'bg-background/95 backdrop-blur-sm'
      )}
    >
      <div className={cn(
        'flex items-center justify-between gap-2 px-3 py-2 flex-shrink-0',
        !isGallery && 'border-b border-border'
      )}>
        {isGallery ? (
          <p className="pl-1 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground tabular-nums">
            {index + 1} / {count}
          </p>
        ) : (
          <p className="text-sm font-medium truncate min-w-0">
            {photo.fileName}
            <span className="ml-2 text-xs text-muted-foreground">{index + 1} / {count}</span>
          </p>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {canDownload && (
            <button
              type="button"
              onClick={handleDownload}
              className={iconButtonClass}
              title={t('downloadPhoto')}
              aria-label={t('downloadPhoto')}
            >
              <Download className="w-5 h-5" />
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={iconButtonClass}
            aria-label={t('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        className={cn('flex-1 relative min-h-0 flex items-center justify-center touch-pan-y touch-pinch-zoom', isGallery ? 'px-4 pb-6 sm:px-16' : 'p-4')}
        onClick={onClose}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
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
              className={cn(arrowClass, 'left-2')}
              aria-label={t('previousPhoto')}
            >
              <ChevronLeft className={arrowIconClass} strokeWidth={isGallery ? 1.5 : 2} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goNext() }}
              className={cn(arrowClass, 'right-2')}
              aria-label={t('nextPhoto')}
            >
              <ChevronRight className={arrowIconClass} strokeWidth={isGallery ? 1.5 : 2} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
