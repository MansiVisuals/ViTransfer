'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Video } from '@prisma/client'
import { X, ChevronDown } from 'lucide-react'
import { Button } from './ui/button'
import VideoComparisonControls from './VideoComparisonControls'
import VideoComparisonSlider from './VideoComparisonSlider'

interface VideoComparisonProps {
  videoVersions: Video[]
  defaultQuality?: '720p' | '1080p'
  defaultVersionA?: number
  defaultVersionB?: number
  timestampDisplayMode?: 'TIMECODE' | 'AUTO'
  onClose: () => void
}

function getVideoUrl(video: Video, quality: '720p' | '1080p'): string {
  if (quality === '1080p') {
    return (video as any).streamUrl1080p || (video as any).streamUrl720p || ''
  }
  return (video as any).streamUrl720p || (video as any).streamUrl1080p || ''
}

export default function VideoComparison({
  videoVersions,
  defaultQuality = '720p',
  defaultVersionA,
  defaultVersionB,
  timestampDisplayMode = 'TIMECODE',
  onClose,
}: VideoComparisonProps) {
  const t = useTranslations('videos')
  // Sort versions by version number ascending so selectors are ordered logically
  const sorted = [...videoVersions].sort((a, b) => a.version - b.version)

  // Default: A = second-to-last (previous), B = last (latest)
  const initialA = defaultVersionA !== undefined
    ? sorted.findIndex(v => v.version === defaultVersionA)
    : Math.max(0, sorted.length - 2)
  const initialB = defaultVersionB !== undefined
    ? sorted.findIndex(v => v.version === defaultVersionB)
    : sorted.length - 1

  const [versionAIndex, setVersionAIndex] = useState(Math.max(0, initialA))
  const [versionBIndex, setVersionBIndex] = useState(Math.max(0, initialB))
  const [mode, setMode] = useState<'side-by-side' | 'slider'>('side-by-side')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [showSelectorA, setShowSelectorA] = useState(false)
  const [showSelectorB, setShowSelectorB] = useState(false)

  const videoRefA = useRef<HTMLVideoElement | null>(null)
  const videoRefB = useRef<HTMLVideoElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const currentTimeRef = useRef(0)
  const isSyncingRef = useRef(false)

  const versionA = sorted[versionAIndex]
  const versionB = sorted[versionBIndex]
  const videoUrlA = getVideoUrl(versionA, defaultQuality)
  const videoUrlB = getVideoUrl(versionB, defaultQuality)
  const videoFps = versionA?.fps || versionB?.fps || 24

  // --- Synced playback ---
  // Video A is the master clock. B follows A via timeupdate events.

  const syncBToA = useCallback(() => {
    const a = videoRefA.current
    const b = videoRefB.current
    if (!a || !b || isSyncingRef.current) return

    const drift = Math.abs(a.currentTime - b.currentTime)
    // Tight sync: correct any drift > 0.05s (roughly 1 frame at 24fps)
    if (drift > 0.05) {
      isSyncingRef.current = true
      b.currentTime = a.currentTime
      // Release lock after a short delay to avoid feedback loops
      requestAnimationFrame(() => { isSyncingRef.current = false })
    }
  }, [])

  const handlePlayPause = useCallback(() => {
    const a = videoRefA.current
    const b = videoRefB.current
    if (!a || !b) return

    if (isPlaying) {
      a.pause()
      b.pause()
      setIsPlaying(false)
    } else {
      // Sync B to A's position before playing
      b.currentTime = a.currentTime
      // Play both together
      Promise.all([a.play(), b.play()]).catch(() => {})
      setIsPlaying(true)
    }
  }, [isPlaying])

  const handleSeek = useCallback((time: number) => {
    const a = videoRefA.current
    const b = videoRefB.current
    if (a) a.currentTime = time
    if (b) b.currentTime = time
    currentTimeRef.current = time
    setCurrentTime(time)
  }, [])

  const handleFrameStep = useCallback((direction: 'forward' | 'backward') => {
    const a = videoRefA.current
    const b = videoRefB.current

    // Pause both before stepping
    if (a && !a.paused) a.pause()
    if (b && !b.paused) b.pause()
    setIsPlaying(false)

    const frameDuration = 1 / videoFps
    const current = a?.currentTime ?? currentTimeRef.current
    const newTime = direction === 'forward'
      ? Math.min(videoDuration, current + frameDuration)
      : Math.max(0, current - frameDuration)

    if (a) a.currentTime = newTime
    if (b) b.currentTime = newTime
    currentTimeRef.current = newTime
    setCurrentTime(newTime)
  }, [videoFps, videoDuration])

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed)
    if (videoRefA.current) videoRefA.current.playbackRate = speed
    if (videoRefB.current) videoRefB.current.playbackRate = speed
  }, [])

  // Master clock: A's timeupdate drives the UI and syncs B
  useEffect(() => {
    const a = videoRefA.current
    if (!a) return

    const onTimeUpdate = () => {
      currentTimeRef.current = a.currentTime
      setCurrentTime(a.currentTime)
      syncBToA()
    }

    const onPlay = () => {
      setIsPlaying(true)
      // Ensure B is also playing when A starts
      const b = videoRefB.current
      if (b && b.paused) {
        b.currentTime = a.currentTime
        b.play().catch(() => {})
      }
    }

    const onPause = () => {
      setIsPlaying(false)
      // Pause B when A pauses
      videoRefB.current?.pause()
    }

    const onEnded = () => {
      setIsPlaying(false)
      videoRefB.current?.pause()
    }

    // Use the native timeupdate for sync (fires ~4x/sec, low overhead)
    a.addEventListener('timeupdate', onTimeUpdate)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnded)

    return () => {
      a.removeEventListener('timeupdate', onTimeUpdate)
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onEnded)
    }
  }, [syncBToA, videoUrlA])

  // Handle metadata load — set duration, apply speed
  const handleLoadedMetadata = useCallback(() => {
    const a = videoRefA.current
    const b = videoRefB.current
    const dur = a?.duration || b?.duration || 0
    if (dur && dur !== Infinity) {
      setVideoDuration(dur)
    }
    if (a) a.playbackRate = playbackSpeed
    if (b) b.playbackRate = playbackSpeed
  }, [playbackSpeed])

  // Keyboard shortcuts — match the main player exactly (Ctrl+ prefix)
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      // Escape: close comparison (no Ctrl needed)
      if (e.key === 'Escape') {
        onClose()
        return
      }

      // Ctrl+Space: Play/Pause
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault()
        e.stopPropagation()
        handlePlayPause()
        return
      }

      // Ctrl+, or Ctrl+<: Decrease speed by 0.25x
      if (e.ctrlKey && (e.code === 'Comma' || e.key === '<')) {
        e.preventDefault()
        e.stopPropagation()
        setPlaybackSpeed(prev => {
          const next = Math.max(0.25, prev - 0.25)
          if (videoRefA.current) videoRefA.current.playbackRate = next
          if (videoRefB.current) videoRefB.current.playbackRate = next
          return next
        })
        return
      }

      // Ctrl+. or Ctrl+>: Increase speed by 0.25x
      if (e.ctrlKey && (e.code === 'Period' || e.key === '>')) {
        e.preventDefault()
        e.stopPropagation()
        setPlaybackSpeed(prev => {
          const next = Math.min(2.0, prev + 0.25)
          if (videoRefA.current) videoRefA.current.playbackRate = next
          if (videoRefB.current) videoRefB.current.playbackRate = next
          return next
        })
        return
      }

      // Ctrl+/: Reset speed to 1.0x
      if (e.ctrlKey && (e.code === 'Slash' || e.key === '/' || e.key === '?')) {
        e.preventDefault()
        e.stopPropagation()
        setPlaybackSpeed(1.0)
        if (videoRefA.current) videoRefA.current.playbackRate = 1.0
        if (videoRefB.current) videoRefB.current.playbackRate = 1.0
        return
      }

      // Ctrl+J: Go back one frame
      if (e.ctrlKey && e.code === 'KeyJ') {
        e.preventDefault()
        e.stopPropagation()
        handleFrameStep('backward')
        return
      }

      // Ctrl+L: Go forward one frame
      if (e.ctrlKey && e.code === 'KeyL') {
        e.preventDefault()
        e.stopPropagation()
        handleFrameStep('forward')
        return
      }
    }

    // Use capture phase like the main player
    window.addEventListener('keydown', handleKeyboard, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyboard, { capture: true })
  }, [onClose, handlePlayPause, handleFrameStep])

  // Pause on unmount
  useEffect(() => {
    return () => {
      videoRefA.current?.pause()
      videoRefB.current?.pause()
    }
  }, [])

  // Reset time when versions change
  useEffect(() => {
    setCurrentTime(0)
    currentTimeRef.current = 0
    setVideoDuration(0)
    setIsPlaying(false)
  }, [versionAIndex, versionBIndex])

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground truncate">
            {t('compareVersions')}
          </h2>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {versionA?.name}
          </span>
        </div>

        {/* Version Selectors */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Version A Selector */}
          <div className="relative">
            <button
              onClick={() => { setShowSelectorA(!showSelectorA); setShowSelectorB(false) }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-500/15 text-blue-500 rounded-md border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
            >
              A: {versionA?.versionLabel}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showSelectorA && (
              <div className="absolute top-full mt-1 right-0 bg-popover border border-border rounded-lg shadow-xl z-50 min-w-[120px] py-1">
                {sorted.map((v, i) => (
                  <button
                    key={v.id}
                    onClick={() => { setVersionAIndex(i); setShowSelectorA(false) }}
                    disabled={i === versionBIndex}
                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-accent transition-colors ${
                      i === versionAIndex ? 'bg-accent font-semibold' : ''
                    } ${i === versionBIndex ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {v.versionLabel}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Version B Selector */}
          <div className="relative">
            <button
              onClick={() => { setShowSelectorB(!showSelectorB); setShowSelectorA(false) }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-green-500/15 text-green-500 rounded-md border border-green-500/30 hover:bg-green-500/25 transition-colors"
            >
              B: {versionB?.versionLabel}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showSelectorB && (
              <div className="absolute top-full mt-1 right-0 bg-popover border border-border rounded-lg shadow-xl z-50 min-w-[120px] py-1">
                {sorted.map((v, i) => (
                  <button
                    key={v.id}
                    onClick={() => { setVersionBIndex(i); setShowSelectorB(false) }}
                    disabled={i === versionAIndex}
                    className={`w-full px-3 py-1.5 text-left text-xs hover:bg-accent transition-colors ${
                      i === versionBIndex ? 'bg-accent font-semibold' : ''
                    } ${i === versionAIndex ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {v.versionLabel}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button variant="ghost" size="sm" onClick={onClose} className="ml-1">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Video Area */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 flex flex-col p-2 sm:p-4"
        onClick={() => { setShowSelectorA(false); setShowSelectorB(false) }}
      >
        <div className="flex-1 min-h-0 relative">
          {mode === 'side-by-side' ? (
            /* Side-by-Side Mode */
            <div className="h-full flex flex-col sm:flex-row gap-2">
              {/* Video A */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="text-xs font-medium text-blue-500 mb-1 px-1">
                  A: {versionA?.versionLabel}
                </div>
                <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden bg-muted/50 backdrop-blur-sm"
                  style={{ aspectRatio: '16 / 9' }}
                >
                  <video
                    ref={videoRefA}
                    key={`a-${versionA?.id}`}
                    src={videoUrlA}
                    poster={(versionA as any)?.thumbnailUrl || undefined}
                    className="w-full h-full object-contain cursor-pointer"
                    crossOrigin="anonymous"
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={handleLoadedMetadata}
                    onClick={handlePlayPause}
                  />
                </div>
              </div>

              {/* Video B */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="text-xs font-medium text-green-500 mb-1 px-1">
                  B: {versionB?.versionLabel}
                </div>
                <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden bg-muted/50 backdrop-blur-sm"
                  style={{ aspectRatio: '16 / 9' }}
                >
                  <video
                    ref={videoRefB}
                    key={`b-${versionB?.id}`}
                    src={videoUrlB}
                    poster={(versionB as any)?.thumbnailUrl || undefined}
                    className="w-full h-full object-contain cursor-pointer"
                    crossOrigin="anonymous"
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={handleLoadedMetadata}
                    onClick={handlePlayPause}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Slider Mode */
            <div className="h-full flex items-center justify-center">
              <div className="w-full max-h-full" style={{ aspectRatio: '16 / 9' }}>
                <VideoComparisonSlider
                  videoRefA={videoRefA}
                  videoRefB={videoRefB}
                  videoUrlA={videoUrlA}
                  videoUrlB={videoUrlB}
                  labelA={`A: ${versionA?.versionLabel}`}
                  labelB={`B: ${versionB?.versionLabel}`}
                  posterA={(versionA as any)?.thumbnailUrl}
                  posterB={(versionB as any)?.thumbnailUrl}
                  onLoadedMetadata={handleLoadedMetadata}
                />
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-shrink-0 mt-2">
          <VideoComparisonControls
            videoDuration={videoDuration}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onFrameStep={handleFrameStep}
            mode={mode}
            onModeChange={setMode}
            playbackSpeed={playbackSpeed}
            onSpeedChange={handleSpeedChange}
            videoFps={videoFps}
            timestampDisplayMode={timestampDisplayMode}
          />
        </div>
      </div>

      {/* Speed indicator */}
      {playbackSpeed !== 1 && (
        <div className="absolute top-16 right-6 bg-black/80 text-white px-3 py-1.5 rounded-md text-sm font-medium pointer-events-none z-30">
          {playbackSpeed.toFixed(2)}x
        </div>
      )}
    </div>
  )
}
