'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward, Columns2, SplitSquareHorizontal } from 'lucide-react'
import { secondsToTimecode, formatCommentTimestamp } from '@/lib/timecode'

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatTimeWithMode(
  seconds: number,
  fps: number,
  videoDurationSeconds: number,
  mode: 'TIMECODE' | 'AUTO'
): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return mode === 'TIMECODE' ? '00:00:00:00' : '0:00'
  const timecode = secondsToTimecode(seconds, fps)
  return formatCommentTimestamp({ timecode, fps, videoDurationSeconds, mode })
}

interface VideoComparisonControlsProps {
  videoDuration: number
  currentTime: number
  isPlaying: boolean
  onPlayPause: () => void
  onSeek: (time: number) => void
  onFrameStep: (direction: 'forward' | 'backward') => void
  mode: 'side-by-side' | 'slider'
  onModeChange: (mode: 'side-by-side' | 'slider') => void
  playbackSpeed: number
  onSpeedChange: (speed: number) => void
  videoFps: number
  timestampDisplayMode: 'TIMECODE' | 'AUTO'
}

export default function VideoComparisonControls({
  videoDuration,
  currentTime,
  isPlaying,
  onPlayPause,
  onSeek,
  onFrameStep,
  mode,
  onModeChange,
  playbackSpeed,
  onSpeedChange,
  videoFps,
  timestampDisplayMode,
}: VideoComparisonControlsProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [hoveredTime, setHoveredTime] = useState<number | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  const progress = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoDuration) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    onSeek(percentage * videoDuration)
  }, [videoDuration, onSeek])

  const handleTimelineMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true)
    handleTimelineClick(e)
  }, [handleTimelineClick])

  const handleTimelineTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoDuration) return
    setIsDragging(true)
    const touch = e.touches[0]
    const rect = timelineRef.current.getBoundingClientRect()
    const x = touch.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    onSeek(percentage * videoDuration)
  }, [videoDuration, onSeek])

  const handleTimelineTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoDuration || !isDragging) return
    const touch = e.touches[0]
    const rect = timelineRef.current.getBoundingClientRect()
    const x = touch.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    onSeek(percentage * videoDuration)
  }, [isDragging, videoDuration, onSeek])

  const handleTimelineTouchEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleTimelineMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoDuration) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    setHoveredTime(percentage * videoDuration)
    if (isDragging) {
      onSeek(percentage * videoDuration)
    }
  }, [isDragging, videoDuration, onSeek])

  const handleTimelineMouseLeave = useCallback(() => {
    setHoveredTime(null)
  }, [])

  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragging) setIsDragging(false)
    }
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [isDragging])

  return (
    <div className="bg-gradient-to-t from-black/95 via-black/60 to-transparent p-2 sm:p-3 rounded-b-xl">
      {/* Timeline */}
      <div className="mb-2 sm:mb-3 px-1">
        <div
          ref={timelineRef}
          className="relative h-8 sm:h-10 group cursor-pointer touch-none"
          onMouseDown={handleTimelineMouseDown}
          onClick={handleTimelineClick}
          onMouseMove={handleTimelineMouseMove}
          onMouseLeave={handleTimelineMouseLeave}
          onTouchStart={handleTimelineTouchStart}
          onTouchMove={handleTimelineTouchMove}
          onTouchEnd={handleTimelineTouchEnd}
        >
          {/* Background Track */}
          <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 sm:h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="absolute inset-0 bg-white/30" />
            <div
              className="absolute inset-y-0 left-0 bg-primary transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Playhead */}
          <div
            className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-20"
            style={{ left: `${progress}%` }}
          >
            <div className="w-4 h-4 sm:w-5 sm:h-5 bg-white rounded-full shadow-lg border-2 border-primary -translate-x-1/2 group-hover:scale-110 transition-transform" />
          </div>

          {/* Hover Time Indicator */}
          {hoveredTime !== null && !isDragging && (
            <div
              className="absolute bottom-full mb-2 px-2 py-1 bg-black/90 text-white text-xs font-mono rounded border border-white/20 shadow-lg whitespace-nowrap pointer-events-none"
              style={{
                left: `${(hoveredTime / videoDuration) * 100}%`,
                transform: 'translateX(-50%)',
              }}
            >
              {formatTimeWithMode(hoveredTime, videoFps, videoDuration, timestampDisplayMode)}
            </div>
          )}
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 px-1">
        {/* Left Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => onFrameStep('backward')}
            className="p-2 sm:p-2.5 hover:bg-white/10 active:bg-white/20 rounded-lg transition-colors touch-manipulation"
            aria-label="Previous frame"
            title="Previous frame (Ctrl+J)"
          >
            <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </button>

          <button
            onClick={onPlayPause}
            className="p-2.5 sm:p-3 hover:bg-white/10 active:bg-white/20 rounded-lg transition-colors touch-manipulation"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause (Ctrl+Space)' : 'Play (Ctrl+Space)'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-white" />
            ) : (
              <Play className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-white" />
            )}
          </button>

          <button
            onClick={() => onFrameStep('forward')}
            className="p-2 sm:p-2.5 hover:bg-white/10 active:bg-white/20 rounded-lg transition-colors touch-manipulation"
            aria-label="Next frame"
            title="Next frame (Ctrl+L)"
          >
            <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </button>

          {/* Time Display */}
          <div className="text-white text-xs sm:text-sm font-mono ml-1 sm:ml-2 whitespace-nowrap">
            {formatTimeWithMode(currentTime, videoFps, videoDuration, timestampDisplayMode)} / {formatTimeWithMode(videoDuration, videoFps, videoDuration, timestampDisplayMode)}
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Speed */}
          <button
            onClick={() => {
              const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]
              const idx = speeds.indexOf(playbackSpeed)
              const next = idx >= 0 && idx < speeds.length - 1 ? speeds[idx + 1] : speeds[0]
              onSpeedChange(next)
            }}
            className="px-2 py-1 sm:px-2.5 sm:py-1.5 hover:bg-white/10 active:bg-white/20 rounded-lg transition-colors text-white text-xs sm:text-sm font-mono touch-manipulation"
            aria-label="Playback speed"
            title="Cycle speed (Ctrl+, / Ctrl+.)"
          >
            {playbackSpeed}x
          </button>

          {/* Mode Toggle */}
          <button
            onClick={() => onModeChange(mode === 'side-by-side' ? 'slider' : 'side-by-side')}
            className="p-2 sm:p-2.5 hover:bg-white/10 active:bg-white/20 rounded-lg transition-colors touch-manipulation"
            aria-label={mode === 'side-by-side' ? 'Switch to slider mode' : 'Switch to side-by-side mode'}
            title={mode === 'side-by-side' ? 'Slider mode' : 'Side-by-side mode'}
          >
            {mode === 'side-by-side' ? (
              <SplitSquareHorizontal className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            ) : (
              <Columns2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
