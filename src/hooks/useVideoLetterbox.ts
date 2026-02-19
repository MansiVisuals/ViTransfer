'use client'

import { useState, useEffect, useCallback, RefObject } from 'react'

interface LetterboxRect {
  offsetX: number
  offsetY: number
  renderWidth: number
  renderHeight: number
}

export function useVideoLetterbox(
  videoRef: RefObject<HTMLVideoElement | null>,
  containerRef: RefObject<HTMLDivElement | null>
): LetterboxRect {
  const [rect, setRect] = useState<LetterboxRect>({
    offsetX: 0,
    offsetY: 0,
    renderWidth: 0,
    renderHeight: 0,
  })

  const recalculate = useCallback(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container) return

    const videoWidth = video.videoWidth
    const videoHeight = video.videoHeight
    if (!videoWidth || !videoHeight) return

    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight
    if (!containerWidth || !containerHeight) return

    const containerAspect = containerWidth / containerHeight
    const videoAspect = videoWidth / videoHeight

    let renderWidth: number
    let renderHeight: number
    let offsetX: number
    let offsetY: number

    if (videoAspect > containerAspect) {
      // Video is wider than container -> vertical letterbox (bars top/bottom)
      renderWidth = containerWidth
      renderHeight = renderWidth / videoAspect
      offsetX = 0
      offsetY = (containerHeight - renderHeight) / 2
    } else {
      // Video is taller than container -> horizontal letterbox (bars left/right)
      renderHeight = containerHeight
      renderWidth = renderHeight * videoAspect
      offsetY = 0
      offsetX = (containerWidth - renderWidth) / 2
    }

    setRect((prev) => {
      if (
        prev.offsetX === offsetX &&
        prev.offsetY === offsetY &&
        prev.renderWidth === renderWidth &&
        prev.renderHeight === renderHeight
      ) {
        return prev
      }
      return { offsetX, offsetY, renderWidth, renderHeight }
    })
  }, [videoRef, containerRef])

  useEffect(() => {
    const video = videoRef.current
    const container = containerRef.current
    if (!video || !container) return

    // Recalculate when video metadata loads
    const handleLoadedMetadata = () => recalculate()
    video.addEventListener('loadedmetadata', handleLoadedMetadata)

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(() => recalculate())
    resizeObserver.observe(container)

    // Initial calculation
    if (video.videoWidth > 0) {
      recalculate()
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      resizeObserver.disconnect()
    }
  }, [videoRef, containerRef, recalculate])

  return rect
}
