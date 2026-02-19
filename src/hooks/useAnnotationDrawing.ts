'use client'

import { useState, useCallback, useRef } from 'react'
import {
  Shape,
  FreehandShape,
  AnnotationData,
  AnnotationColor,
  ANNOTATION_COLORS,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_OPACITY,
  Point,
} from '@/types/annotations'

/**
 * Ramer-Douglas-Peucker path simplification
 * Reduces freehand point count while preserving shape
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const lengthSq = dx * dx + dy * dy

  if (lengthSq === 0) {
    const ddx = point.x - lineStart.x
    const ddy = point.y - lineStart.y
    return Math.sqrt(ddx * ddx + ddy * ddy)
  }

  const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq))
  const projX = lineStart.x + t * dx
  const projY = lineStart.y + t * dy
  const ddx = point.x - projX
  const ddy = point.y - projY
  return Math.sqrt(ddx * ddx + ddy * ddy)
}

function simplifyPath(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points

  let maxDist = 0
  let maxIndex = 0

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[points.length - 1])
    if (dist > maxDist) {
      maxDist = dist
      maxIndex = i
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIndex + 1), epsilon)
    const right = simplifyPath(points.slice(maxIndex), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [points[0], points[points.length - 1]]
}

export function useAnnotationDrawing() {
  const [activeColor, setActiveColor] = useState<AnnotationColor>(ANNOTATION_COLORS[2]) // Red default
  const [strokeWidth, setStrokeWidth] = useState(DEFAULT_STROKE_WIDTH)
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [undoStack, setUndoStack] = useState<Shape[][]>([])
  const [activeShape, setActiveShape] = useState<Shape | null>(null)
  const shapeIdCounter = useRef(0)

  // Refs to avoid stale closures in pointer event handlers
  const activeShapeRef = useRef<Shape | null>(null)
  const shapesRef = useRef<Shape[]>([])

  const generateShapeId = useCallback(() => {
    shapeIdCounter.current += 1
    return `s${shapeIdCounter.current}`
  }, [])

  const startShape = useCallback(
    (point: Point) => {
      const id = generateShapeId()
      const newShape: FreehandShape = {
        id,
        type: 'freehand',
        color: activeColor,
        strokeWidth,
        opacity,
        points: [point],
      }

      activeShapeRef.current = newShape
      setActiveShape(newShape)
    },
    [activeColor, strokeWidth, opacity, generateShapeId]
  )

  const updateShape = useCallback(
    (point: Point) => {
      const prev = activeShapeRef.current
      if (!prev || prev.type !== 'freehand') return

      const updated: FreehandShape = { ...prev, points: [...prev.points, point] }
      activeShapeRef.current = updated
      setActiveShape(updated)
    },
    []
  )

  const finishShape = useCallback(() => {
    const current = activeShapeRef.current
    if (!current || current.type !== 'freehand') {
      activeShapeRef.current = null
      setActiveShape(null)
      return
    }

    let isValid = true
    let finalShape: Shape = current

    if (current.points.length < 2) {
      isValid = false
    } else {
      const simplified = simplifyPath(current.points, 0.002)
      finalShape = { ...current, points: simplified }
    }

    if (isValid) {
      // Capture current shapes BEFORE mutating the ref
      const snapshotForUndo = [...shapesRef.current]
      const newShapes = [...shapesRef.current, finalShape]

      // Update ref immediately for next pointer events
      shapesRef.current = newShapes

      // Batch state updates
      setUndoStack((prev) => [...prev.slice(-49), snapshotForUndo])
      setShapes(newShapes)
    }

    activeShapeRef.current = null
    setActiveShape(null)
  }, [])

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev
      const lastEntry = prev[prev.length - 1]
      shapesRef.current = lastEntry
      setShapes(lastEntry)
      return prev.slice(0, -1)
    })
  }, [])

  const reset = useCallback(() => {
    setShapes([])
    setUndoStack([])
    setActiveShape(null)
    activeShapeRef.current = null
    shapesRef.current = []
    shapeIdCounter.current = 0
  }, [])

  const getAnnotationData = useCallback((): AnnotationData | null => {
    if (shapesRef.current.length === 0) return null

    return {
      version: 1,
      shapes: shapesRef.current,
    }
  }, [])

  const hasShapes = shapes.length > 0

  return {
    activeColor,
    setActiveColor,
    strokeWidth,
    setStrokeWidth,
    opacity,
    setOpacity,
    shapes,
    activeShape,
    hasShapes,
    undoStack,
    startShape,
    updateShape,
    finishShape,
    undo,
    reset,
    getAnnotationData,
  }
}
