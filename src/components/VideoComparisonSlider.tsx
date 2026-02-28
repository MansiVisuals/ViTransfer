'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { GripVertical } from 'lucide-react'

interface VideoComparisonSliderProps {
  videoRefA: React.RefObject<HTMLVideoElement | null>
  videoRefB: React.RefObject<HTMLVideoElement | null>
  videoUrlA: string
  videoUrlB: string
  labelA: string
  labelB: string
  posterA?: string
  posterB?: string
  onLoadedMetadata: () => void
}

export default function VideoComparisonSlider({
  videoRefA,
  videoRefB,
  videoUrlA,
  videoUrlB,
  labelA,
  labelB,
  posterA,
  posterB,
  onLoadedMetadata,
}: VideoComparisonSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setSliderPosition(percentage)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    updatePosition(e.clientX)
  }, [updatePosition])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true)
    updatePosition(e.touches[0].clientX)
  }, [updatePosition])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      updatePosition(e.clientX)
    }

    const handleTouchMove = (e: TouchEvent) => {
      updatePosition(e.touches[0].clientX)
    }

    const handleEnd = () => setIsDragging(false)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('touchend', handleEnd)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleEnd)
    }
  }, [isDragging, updatePosition])

  // Keyboard arrow keys to nudge slider
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setSliderPosition(prev => Math.max(0, prev - 1))
      } else if (e.key === 'ArrowRight') {
        setSliderPosition(prev => Math.min(100, prev + 1))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl bg-muted/50 backdrop-blur-sm select-none"
      style={{ aspectRatio: '16 / 9' }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {/* Video A (full, underneath) */}
      <video
        ref={videoRefA}
        src={videoUrlA}
        poster={posterA}
        className="absolute inset-0 w-full h-full object-contain"
        crossOrigin="anonymous"
        playsInline
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
      />

      {/* Video B (clipped, on top) */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }}
      >
        <video
          ref={videoRefB}
          src={videoUrlB}
          poster={posterB}
          className="absolute inset-0 w-full h-full object-contain"
          crossOrigin="anonymous"
          playsInline
          preload="metadata"
          onLoadedMetadata={onLoadedMetadata}
        />
      </div>

      {/* Version Labels */}
      <div className="absolute top-3 left-3 px-2 py-1 bg-black/70 text-white text-xs font-medium rounded backdrop-blur-sm z-10 pointer-events-none">
        {labelA}
      </div>
      <div className="absolute top-3 right-3 px-2 py-1 bg-black/70 text-white text-xs font-medium rounded backdrop-blur-sm z-10 pointer-events-none">
        {labelB}
      </div>

      {/* Slider Divider Line */}
      <div
        className="absolute top-0 bottom-0 z-20 pointer-events-none"
        style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
      >
        <div className="w-0.5 h-full bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)]" />

        {/* Drag Handle */}
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full shadow-lg flex items-center justify-center pointer-events-auto cursor-ew-resize transition-transform ${
            isDragging ? 'scale-110' : 'hover:scale-110'
          }`}
        >
          <GripVertical className="w-5 h-5 text-gray-700" />
        </div>
      </div>
    </div>
  )
}
