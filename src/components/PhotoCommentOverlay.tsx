'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface PinComment {
  id: string
  pinX: number
  pinY: number
  authorName?: string
}

interface PhotoCommentOverlayProps {
  /** Existing comments that have pin coordinates */
  comments: PinComment[]
  /** Called when a user clicks the image to place a new pin (coordinates 0.0–1.0) */
  onPinPlace?: (pinX: number, pinY: number) => void
  /** Called when a user clicks an existing comment pin */
  onPinClick?: (commentId: string) => void
  /** The ID of the currently focused/highlighted comment pin */
  activePinId?: string | null
  /** Whether placing new pins is enabled */
  canPlace?: boolean
  /** Additional class names for the container */
  className?: string
  children: React.ReactNode
}

export default function PhotoCommentOverlay({
  comments,
  onPinPlace,
  onPinClick,
  activePinId,
  canPlace = false,
  className,
  children,
}: PhotoCommentOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null)

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!canPlace || !onPinPlace) return

      const rect = e.currentTarget.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height

      // Clamp to 0.0–1.0
      const pinX = Math.max(0, Math.min(1, x))
      const pinY = Math.max(0, Math.min(1, y))

      setPendingPin({ x: pinX, y: pinY })
      onPinPlace(pinX, pinY)
    },
    [canPlace, onPinPlace]
  )

  /** Clear pending pin (called by parent after comment is submitted) */
  const clearPending = useCallback(() => setPendingPin(null), [])

  // Expose clearPending through a data attribute so parent can call it
  // Clear pending pin when a new comment is added (comments array grows)
  const prevCommentCount = useRef(comments.length)
  useEffect(() => {
    if (comments.length !== prevCommentCount.current) {
      prevCommentCount.current = comments.length
      setPendingPin(null)
    }
  }, [comments.length])

  return (
    <div
      ref={containerRef}
      className={cn('relative', canPlace && 'cursor-crosshair', className)}
      onClick={handleClick}
    >
      {children}

      {/* Existing comment pins */}
      {comments.map((comment, index) => (
        <button
          key={comment.id}
          className={cn(
            'absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center text-[10px] font-bold transition-all z-10 border-2',
            comment.id === activePinId
              ? 'bg-primary text-primary-foreground border-primary-foreground scale-125 shadow-lg'
              : 'bg-primary/90 text-primary-foreground border-white/80 hover:scale-110 shadow-md'
          )}
          style={{
            left: `${comment.pinX * 100}%`,
            top: `${comment.pinY * 100}%`,
          }}
          onClick={(e) => {
            e.stopPropagation()
            onPinClick?.(comment.id)
          }}
          title={comment.authorName || `Comment ${index + 1}`}
        >
          {index + 1}
        </button>
      ))}

      {/* Pending pin (before comment is submitted) */}
      {pendingPin && (
        <div
          className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/60 border-2 border-dashed border-primary-foreground animate-pulse z-10"
          style={{
            left: `${pendingPin.x * 100}%`,
            top: `${pendingPin.y * 100}%`,
          }}
        />
      )}
    </div>
  )
}
