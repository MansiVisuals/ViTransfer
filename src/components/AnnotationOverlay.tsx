'use client'

import { useMemo, useState, useEffect, RefObject } from 'react'
import { AnnotationData, Shape } from '@/types/annotations'
import { timecodeToSeconds } from '@/lib/timecode'

interface AnnotationOverlayProps {
  comments: Array<{
    id: string
    timecode: string
    timecodeEnd?: string | null
    annotations?: AnnotationData | null
  }>
  currentTime: number
  videoFps: number
  containerRef: RefObject<HTMLDivElement | null>
  videoRef: RefObject<HTMLVideoElement | null>
  hidden?: boolean
}

function renderShape(shape: Shape, renderWidth: number, renderHeight: number, key: string) {
  const sw = shape.strokeWidth * renderWidth
  const shapeOpacity = (shape as any).opacity ?? 1

  if (shape.type === 'freehand') {
    if (shape.points.length < 2) return null
    const points = shape.points
      .map((p) => `${p.x * renderWidth},${p.y * renderHeight}`)
      .join(' ')
    return (
      <polyline
        key={key}
        points={points}
        fill="none"
        stroke={shape.color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={shapeOpacity}
      />
    )
  }

  return null
}

function getVideoRect(
  video: HTMLVideoElement,
  container: HTMLDivElement
): { offsetX: number; offsetY: number; width: number; height: number } | null {
  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight
  if (!videoWidth || !videoHeight) return null

  const containerWidth = container.clientWidth
  const containerHeight = container.clientHeight
  if (!containerWidth || !containerHeight) return null

  const containerAspect = containerWidth / containerHeight
  const videoAspect = videoWidth / videoHeight

  let rw: number, rh: number, ox: number, oy: number

  if (videoAspect > containerAspect) {
    rw = containerWidth
    rh = rw / videoAspect
    ox = 0
    oy = (containerHeight - rh) / 2
  } else {
    rh = containerHeight
    rw = rh * videoAspect
    oy = 0
    ox = (containerWidth - rw) / 2
  }

  return { offsetX: ox, offsetY: oy, width: rw, height: rh }
}

export default function AnnotationOverlay({
  comments,
  currentTime,
  videoFps,
  containerRef,
  videoRef,
  hidden = false,
}: AnnotationOverlayProps) {
  const [rect, setRect] = useState<{ offsetX: number; offsetY: number; width: number; height: number } | null>(null)

  useEffect(() => {
    const recalc = () => {
      const video = videoRef.current
      const container = containerRef.current
      if (!video || !container) return
      const r = getVideoRect(video, container)
      if (r) setRect(r)
    }

    recalc()

    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(recalc)
    observer.observe(container)

    const video = videoRef.current
    if (video) {
      video.addEventListener('loadedmetadata', recalc)
    }

    return () => {
      observer.disconnect()
      if (video) video.removeEventListener('loadedmetadata', recalc)
    }
  }, [videoRef, containerRef])

  const renderWidth = rect?.width || 0
  const renderHeight = rect?.height || 0
  const offsetX = rect?.offsetX || 0
  const offsetY = rect?.offsetY || 0

  const visibleShapes = useMemo(() => {
    if (!renderWidth || !renderHeight) return []

    const result: Array<{ commentId: string; shapes: Shape[] }> = []

    for (const comment of comments) {
      const ann = comment.annotations as any
      if (!ann || typeof ann !== 'object') continue

      // Support both new format (shapes) and legacy format (keyframes)
      let shapes: Shape[] | undefined
      if (Array.isArray(ann.shapes) && ann.shapes.length > 0) {
        shapes = ann.shapes
      } else if (Array.isArray(ann.keyframes)) {
        // Legacy: collect shapes from all keyframes
        const all: Shape[] = []
        for (const kf of ann.keyframes) {
          if (Array.isArray(kf.shapes)) all.push(...kf.shapes)
        }
        if (all.length > 0) shapes = all
      }
      if (!shapes) continue

      const startTime = timecodeToSeconds(comment.timecode, videoFps)
      const endTime = comment.timecodeEnd
        ? timecodeToSeconds(comment.timecodeEnd, videoFps)
        : startTime + 3

      if (currentTime < startTime || currentTime > endTime) continue

      result.push({ commentId: comment.id, shapes })
    }

    return result
  }, [comments, currentTime, videoFps, renderWidth, renderHeight])

  if (!renderWidth || !renderHeight || visibleShapes.length === 0 || hidden) return null

  return (
    <svg
      className="absolute pointer-events-none z-10"
      style={{
        left: offsetX,
        top: offsetY,
        width: renderWidth,
        height: renderHeight,
      }}
      viewBox={`0 0 ${renderWidth} ${renderHeight}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {visibleShapes.map(({ commentId, shapes }) =>
        shapes.map((shape, i) =>
          renderShape(shape, renderWidth, renderHeight, `${commentId}-${shape.id}-${i}`)
        )
      )}
    </svg>
  )
}
