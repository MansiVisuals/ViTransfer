'use client'

import { useState, useRef, useMemo, useCallback } from 'react'
import { Comment } from '@prisma/client'
import { getUserColor } from '@/lib/utils'
import { timecodeToSeconds } from '@/lib/timecode'

type CommentWithReplies = Comment & {
  replies?: Comment[]
}

interface TimelineMarkersProps {
  comments: CommentWithReplies[]
  videoDuration: number
  currentTime: number
  videoFps: number
  onSeek: (timestamp: number) => void
  videoId: string
}

// Color map for marker backgrounds - matches getUserColor output
const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  // Receiver palette (vibrant)
  'border-red-500': { bg: 'bg-red-500', text: 'text-white' },
  'border-orange-500': { bg: 'bg-orange-500', text: 'text-white' },
  'border-amber-500': { bg: 'bg-amber-500', text: 'text-black' },
  'border-yellow-400': { bg: 'bg-yellow-400', text: 'text-black' },
  'border-lime-500': { bg: 'bg-lime-500', text: 'text-black' },
  'border-green-500': { bg: 'bg-green-500', text: 'text-white' },
  'border-emerald-500': { bg: 'bg-emerald-500', text: 'text-white' },
  'border-pink-500': { bg: 'bg-pink-500', text: 'text-white' },
  'border-rose-500': { bg: 'bg-rose-500', text: 'text-white' },
  'border-fuchsia-500': { bg: 'bg-fuchsia-500', text: 'text-white' },
  // Sender palette (earth tones)
  'border-amber-700': { bg: 'bg-amber-700', text: 'text-white' },
  'border-orange-800': { bg: 'bg-orange-800', text: 'text-white' },
  'border-stone-600': { bg: 'bg-stone-600', text: 'text-white' },
  'border-yellow-700': { bg: 'bg-yellow-700', text: 'text-white' },
  'border-lime-700': { bg: 'bg-lime-700', text: 'text-white' },
  'border-green-700': { bg: 'bg-green-700', text: 'text-white' },
  'border-emerald-800': { bg: 'bg-emerald-800', text: 'text-white' },
  'border-teal-800': { bg: 'bg-teal-800', text: 'text-white' },
  'border-slate-600': { bg: 'bg-slate-600', text: 'text-white' },
  'border-zinc-600': { bg: 'bg-zinc-600', text: 'text-white' },
  // Fallback
  'border-gray-500': { bg: 'bg-gray-500', text: 'text-white' },
}

function initialsFromName(name: string | null | undefined): string {
  const value = (name || '').trim()
  if (!value) return '?'

  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    const word = parts[0]
    return word.slice(0, Math.min(2, word.length)).toUpperCase()
  }

  const first = parts[0][0] || ''
  const last = parts[parts.length - 1][0] || ''
  const initials = `${first}${last}`.trim()
  return initials ? initials.toUpperCase() : '?'
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

interface MarkerData {
  id: string
  timestamp: number
  authorName: string | null
  initials: string
  colorKey: string
  content: string
  position: number // percentage 0-100
}

export default function TimelineMarkers({
  comments,
  videoDuration,
  currentTime,
  videoFps,
  onSeek,
  videoId,
}: TimelineMarkersProps) {
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null)
  const touchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Process comments into markers - only show comments with valid timestamps for this video
  const markers = useMemo((): MarkerData[] => {
    if (!videoDuration || videoDuration <= 0) return []

    return comments
      .filter((comment) => {
        // Only show parent comments (not replies)
        if (comment.parentId) return false
        // Only show comments for this video
        if (comment.videoId !== videoId) return false
        // Only show comments with valid timecodes
        if (!comment.timecode || comment.timecode === '00:00:00:00' || comment.timecode === '00:00:00;00') {
          return false
        }
        return true
      })
      .map((comment) => {
        const timestamp = timecodeToSeconds(comment.timecode!, videoFps)
        const effectiveAuthorName = comment.authorName ||
          ((comment as any).user?.name || (comment as any).user?.email || null)
        const colorKey = getUserColor(effectiveAuthorName, false).border

        return {
          id: comment.id,
          timestamp,
          authorName: effectiveAuthorName,
          initials: initialsFromName(effectiveAuthorName),
          colorKey,
          content: comment.content.replace(/<[^>]*>/g, '').slice(0, 100), // Strip HTML, limit length
          position: Math.min(98, Math.max(2, (timestamp / videoDuration) * 100)), // Keep markers away from edges
        }
      })
      .sort((a, b) => a.timestamp - b.timestamp)
  }, [comments, videoDuration, videoFps, videoId])

  // Group markers that are close together to prevent overlap
  const groupedMarkers = useMemo(() => {
    if (markers.length === 0) return []

    const groups: MarkerData[][] = []
    const threshold = 4 // percentage threshold for grouping

    markers.forEach((marker) => {
      const lastGroup = groups[groups.length - 1]
      if (lastGroup && Math.abs(marker.position - lastGroup[0].position) < threshold) {
        lastGroup.push(marker)
      } else {
        groups.push([marker])
      }
    })

    return groups
  }, [markers])

  const handleMarkerClick = useCallback((marker: MarkerData, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation() // Prevent video click-through
    onSeek(marker.timestamp)
  }, [onSeek])

  const handleMouseEnter = useCallback((markerId: string) => {
    setHoveredMarkerId(markerId)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredMarkerId(null)
  }, [])

  const handleTouchStart = useCallback((markerId: string, e: React.TouchEvent) => {
    e.stopPropagation()
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current)
    }
    setHoveredMarkerId(markerId)
    touchTimeoutRef.current = setTimeout(() => {
      setHoveredMarkerId(null)
    }, 3000)
  }, [])

  // Don't render if no markers or no duration
  if (markers.length === 0 || !videoDuration) {
    return null
  }

  // Get tooltip alignment based on position
  const getTooltipAlignment = (position: number): string => {
    if (position < 20) return 'left-0' // Align left edge
    if (position > 80) return 'right-0' // Align right edge
    return 'left-1/2 -translate-x-1/2' // Center
  }

  return (
    <div className="absolute bottom-12 sm:bottom-14 left-0 right-0 h-8 pointer-events-none z-10 px-2">
      {/* Markers container */}
      <div className="relative w-full h-full">
        {groupedMarkers.map((group) => {
          const primaryMarker = group[0]
          const colors = COLOR_MAP[primaryMarker.colorKey] || COLOR_MAP['border-gray-500']
          const isHovered = group.some((m) => m.id === hoveredMarkerId)
          const isStacked = group.length > 1

          return (
            <div
              key={primaryMarker.id}
              className="absolute top-0 pointer-events-auto"
              style={{
                left: `${primaryMarker.position}%`,
                transform: 'translateX(-50%)',
              }}
            >
              {/* Marker button */}
              <button
                type="button"
                onClick={(e) => handleMarkerClick(primaryMarker, e)}
                onMouseEnter={() => handleMouseEnter(primaryMarker.id)}
                onMouseLeave={handleMouseLeave}
                onTouchStart={(e) => handleTouchStart(primaryMarker.id, e)}
                className={`
                  relative flex items-center justify-center
                  w-6 h-6 sm:w-7 sm:h-7
                  rounded-full border-2 border-white/80
                  transition-all duration-200 ease-out
                  hover:scale-125 hover:border-white
                  active:scale-100
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-white
                  ${colors.bg} ${colors.text}
                  ${isHovered ? 'scale-125 border-white shadow-xl z-30' : 'shadow-lg z-10'}
                `}
                style={{
                  boxShadow: isHovered
                    ? '0 0 0 2px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.4)'
                    : '0 2px 8px rgba(0,0,0,0.4)',
                }}
                aria-label={`Comment by ${primaryMarker.authorName || 'Anonymous'} at ${formatTime(primaryMarker.timestamp)}`}
              >
                <span className="text-[9px] sm:text-[10px] font-bold leading-none tracking-tight drop-shadow-sm">
                  {primaryMarker.initials}
                </span>

                {/* Stack indicator for grouped markers */}
                {isStacked && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 bg-white text-black text-[8px] font-bold rounded-full flex items-center justify-center shadow-md"
                  >
                    {group.length}
                  </span>
                )}
              </button>

              {/* Tooltip */}
              {isHovered && (
                <div
                  className={`
                    absolute bottom-full mb-2 ${getTooltipAlignment(primaryMarker.position)}
                    bg-black/95 text-white backdrop-blur-sm
                    rounded-lg shadow-2xl
                    p-2.5 min-w-[180px] max-w-[260px]
                    z-50
                    animate-in fade-in-0 slide-in-from-bottom-1 duration-150
                  `}
                >
                  {group.slice(0, 3).map((marker, idx) => {
                    const markerColors = COLOR_MAP[marker.colorKey] || COLOR_MAP['border-gray-500']
                    return (
                      <div
                        key={marker.id}
                        className={`${idx > 0 ? 'mt-2 pt-2 border-t border-white/20' : ''}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${markerColors.bg} ${markerColors.text}`}
                          >
                            {marker.initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-xs text-white truncate block">
                              {marker.authorName || 'Anonymous'}
                            </span>
                          </div>
                          <span className="text-[10px] text-white/70 font-mono">
                            {formatTime(marker.timestamp)}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/80 leading-relaxed line-clamp-2 pl-7">
                          {marker.content || 'No content'}
                        </p>
                      </div>
                    )
                  })}
                  {group.length > 3 && (
                    <p className="text-[10px] text-white/60 mt-2 pt-2 border-t border-white/20">
                      +{group.length - 3} more
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
