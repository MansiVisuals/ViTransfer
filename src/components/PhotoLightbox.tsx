'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

interface Photo {
  id: string
  name: string
  originalFileName: string
  mimeType: string
  width?: number | null
  height?: number | null
  approved: boolean
}

interface PhotoLightboxProps {
  photos: Photo[]
  initialIndex: number
  isOpen: boolean
  onClose: () => void
  contentTokens: Record<string, string>
  onDownload?: (photo: Photo) => void
}

export default function PhotoLightbox({
  photos,
  initialIndex,
  isOpen,
  onClose,
  contentTokens,
  onDownload,
}: PhotoLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    setCurrentIndex(initialIndex)
    setZoom(1)
  }, [initialIndex, isOpen])

  const goNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setZoom(1)
    }
  }, [currentIndex, photos.length])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setZoom(1)
    }
  }, [currentIndex])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return
    switch (e.key) {
      case 'ArrowRight':
        goNext()
        break
      case 'ArrowLeft':
        goPrev()
        break
      case 'Escape':
        onClose()
        break
    }
  }, [isOpen, goNext, goPrev, onClose])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [isOpen])

  if (!isOpen || photos.length === 0) return null

  const photo = photos[currentIndex]
  const url = contentTokens[photo.id]

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50">
        <div className="text-white text-sm">
          <span className="font-medium">{photo.name}</span>
          <span className="text-white/60 ml-2">{currentIndex + 1} / {photos.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10"
            onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-white/60 text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10"
            onClick={() => setZoom(z => Math.min(4, z + 0.25))}
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          {onDownload && (
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10"
              onClick={() => onDownload(photo)}
              title="Download"
            >
              <Download className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main image area */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center min-h-0">
        {/* Previous button */}
        {currentIndex > 0 && (
          <button
            className="absolute left-2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            onClick={goPrev}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Image */}
        <div className="overflow-auto max-w-full max-h-full flex items-center justify-center">
          {url ? (
            <img
              src={url}
              alt={photo.name}
              className="max-w-full max-h-full object-contain transition-transform"
              style={{ transform: `scale(${zoom})` }}
              draggable={false}
            />
          ) : (
            <div className="text-white/40 text-sm">Loading...</div>
          )}
        </div>

        {/* Next button */}
        {currentIndex < photos.length - 1 && (
          <button
            className="absolute right-2 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            onClick={goNext}
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom thumbnail strip */}
      {photos.length > 1 && (
        <div className="flex items-center justify-center gap-1 px-4 py-2 bg-black/50 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={p.id}
              onClick={() => { setCurrentIndex(i); setZoom(1) }}
              className={cn(
                'w-12 h-12 rounded border-2 overflow-hidden flex-shrink-0 transition-all',
                i === currentIndex ? 'border-white' : 'border-transparent opacity-50 hover:opacity-75'
              )}
            >
              {contentTokens[p.id] ? (
                <img
                  src={contentTokens[p.id]}
                  alt={p.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-white/10" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
