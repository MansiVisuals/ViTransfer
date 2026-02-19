'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import { Shape, Point } from '@/types/annotations'

interface AnnotationCanvasProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  videoRef: React.RefObject<HTMLVideoElement | null>
  shapes: Shape[]
  activeShape: Shape | null
  onStartShape: (point: Point) => void
  onUpdateShape: (point: Point) => void
  onFinishShape: () => void
}

function renderShape(shape: Shape, renderWidth: number, renderHeight: number, key: string) {
  const sw = shape.strokeWidth * renderWidth
  const shapeOpacity = shape.opacity ?? 1

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

/**
 * Calculate the rendered video area within an object-contain container.
 * This determines where the actual video pixels are displayed.
 */
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

  let renderWidth: number
  let renderHeight: number
  let offsetX: number
  let offsetY: number

  if (videoAspect > containerAspect) {
    renderWidth = containerWidth
    renderHeight = renderWidth / videoAspect
    offsetX = 0
    offsetY = (containerHeight - renderHeight) / 2
  } else {
    renderHeight = containerHeight
    renderWidth = renderHeight * videoAspect
    offsetY = 0
    offsetX = (containerWidth - renderWidth) / 2
  }

  return { offsetX, offsetY, width: renderWidth, height: renderHeight }
}

export default function AnnotationCanvas({
  containerRef,
  videoRef,
  shapes,
  activeShape,
  onStartShape,
  onUpdateShape,
  onFinishShape,
}: AnnotationCanvasProps) {
  const isDrawing = useRef(false)
  const [rect, setRect] = useState<{ offsetX: number; offsetY: number; width: number; height: number } | null>(null)

  // Calculate video rect on mount and on resize
  useEffect(() => {
    const recalc = () => {
      const video = videoRef.current
      const container = containerRef.current
      if (!video || !container) return
      const r = getVideoRect(video, container)
      if (r) setRect(r)
    }

    // Initial calc
    recalc()

    // Recalc on resize
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(recalc)
    observer.observe(container)

    // Also listen for video metadata in case it loads after mount
    const video = videoRef.current
    if (video) {
      video.addEventListener('loadedmetadata', recalc)
    }

    return () => {
      observer.disconnect()
      if (video) {
        video.removeEventListener('loadedmetadata', recalc)
      }
    }
  }, [videoRef, containerRef])

  const renderWidth = rect?.width || 0
  const renderHeight = rect?.height || 0
  const offsetX = rect?.offsetX || 0
  const offsetY = rect?.offsetY || 0

  const getPoint = useCallback(
    (clientX: number, clientY: number, svgElement: SVGSVGElement): Point => {
      const svgRect = svgElement.getBoundingClientRect()
      const x = (clientX - svgRect.left) / svgRect.width
      const y = (clientY - svgRect.top) / svgRect.height
      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      }
    },
    []
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const svg = e.currentTarget
      svg.setPointerCapture(e.pointerId)
      isDrawing.current = true
      const point = getPoint(e.clientX, e.clientY, svg)
      onStartShape(point)
    },
    [getPoint, onStartShape]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDrawing.current) return
      e.preventDefault()
      const point = getPoint(e.clientX, e.clientY, e.currentTarget)
      onUpdateShape(point)
    },
    [getPoint, onUpdateShape]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDrawing.current) return
      e.preventDefault()
      isDrawing.current = false
      e.currentTarget.releasePointerCapture(e.pointerId)
      onFinishShape()
    },
    [onFinishShape]
  )

  if (!renderWidth || !renderHeight) {
    // Fallback: cover the full container so user can at least draw
    const container = containerRef.current
    if (!container) return null
    const w = container.clientWidth
    const h = container.clientHeight
    if (!w || !h) return null

    return (
      <svg
        className="absolute inset-0 z-20 cursor-crosshair"
        style={{ width: w, height: h, touchAction: 'none' }}
        viewBox={`0 0 ${w} ${h}`}
        xmlns="http://www.w3.org/2000/svg"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <rect width={w} height={h} fill="rgba(0,0,0,0.05)" />
        {shapes.map((shape, i) =>
          renderShape(shape, w, h, `existing-${shape.id}-${i}`)
        )}
        {activeShape && renderShape(activeShape, w, h, 'active-drawing')}
      </svg>
    )
  }

  return (
    <svg
      className="absolute z-20 cursor-crosshair"
      style={{
        left: offsetX,
        top: offsetY,
        width: renderWidth,
        height: renderHeight,
        touchAction: 'none',
      }}
      viewBox={`0 0 ${renderWidth} ${renderHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Subtle scrim to show drawing area is active */}
      <rect width={renderWidth} height={renderHeight} fill="rgba(0,0,0,0.05)" />

      {/* Existing shapes */}
      {shapes.map((shape, i) =>
        renderShape(shape, renderWidth, renderHeight, `existing-${shape.id}-${i}`)
      )}

      {/* Currently drawing shape */}
      {activeShape &&
        renderShape(activeShape, renderWidth, renderHeight, 'active-drawing')}
    </svg>
  )
}
