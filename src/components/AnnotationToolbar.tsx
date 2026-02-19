'use client'

import { Pencil, Undo2, Check, X, Minus, Plus } from 'lucide-react'
import { AnnotationColor, ANNOTATION_COLORS, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH } from '@/types/annotations'

interface AnnotationToolbarProps {
  activeColor: AnnotationColor
  strokeWidth: number
  opacity: number
  canUndo: boolean
  hasShapes: boolean
  onColorChange: (color: AnnotationColor) => void
  onStrokeWidthChange: (width: number) => void
  onOpacityChange: (opacity: number) => void
  onUndo: () => void
  onDone: () => void
  onCancel: () => void
}

// Tailwind ring classes for color swatches
const COLOR_RING: Record<string, string> = {
  '#FFFFFF': 'ring-gray-300',
  '#000000': 'ring-gray-600',
  '#EF4444': 'ring-red-400',
  '#EAB308': 'ring-yellow-400',
  '#22C55E': 'ring-green-400',
  '#3B82F6': 'ring-blue-400',
}

// Predefined stroke width steps for quick adjustment
const STROKE_STEPS = [0.002, 0.004, 0.008, 0.015, 0.03]

function closestStepIndex(value: number): number {
  let closest = 0
  let minDiff = Math.abs(value - STROKE_STEPS[0])
  for (let i = 1; i < STROKE_STEPS.length; i++) {
    const diff = Math.abs(value - STROKE_STEPS[i])
    if (diff < minDiff) {
      minDiff = diff
      closest = i
    }
  }
  return closest
}

export default function AnnotationToolbar({
  activeColor,
  strokeWidth,
  opacity,
  canUndo,
  hasShapes,
  onColorChange,
  onStrokeWidthChange,
  onOpacityChange,
  onUndo,
  onDone,
  onCancel,
}: AnnotationToolbarProps) {
  const currentStepIndex = closestStepIndex(strokeWidth)

  const decreaseWidth = () => {
    const newIndex = Math.max(0, currentStepIndex - 1)
    onStrokeWidthChange(STROKE_STEPS[newIndex])
  }

  const increaseWidth = () => {
    const newIndex = Math.min(STROKE_STEPS.length - 1, currentStepIndex + 1)
    onStrokeWidthChange(STROKE_STEPS[newIndex])
  }

  // Opacity steps: 25%, 50%, 75%, 100%
  const OPACITY_STEPS = [0.25, 0.5, 0.75, 1]
  const currentOpacityIndex = OPACITY_STEPS.reduce((closest, val, i) =>
    Math.abs(val - opacity) < Math.abs(OPACITY_STEPS[closest] - opacity) ? i : closest, 0)

  const decreaseOpacity = () => {
    const newIndex = Math.max(0, currentOpacityIndex - 1)
    onOpacityChange(OPACITY_STEPS[newIndex])
  }

  const increaseOpacity = () => {
    const newIndex = Math.min(OPACITY_STEPS.length - 1, currentOpacityIndex + 1)
    onOpacityChange(OPACITY_STEPS[newIndex])
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 bg-black/85 backdrop-blur-sm rounded-xl px-2.5 sm:px-3 py-2 shadow-2xl border border-white/10 max-w-[calc(100%-1.5rem)]">
      {/* Row 1: Drawing tools */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Tool indicator */}
        <div className="p-1.5 sm:p-2 rounded-lg bg-white/20 text-white">
          <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </div>

        {/* Separator */}
        <div className="w-px h-5 sm:h-6 bg-white/20 mx-0.5 sm:mx-1" />

        {/* Color Swatches */}
        {ANNOTATION_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onColorChange(color)}
            className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full transition-transform ring-2 ring-inset ${
              COLOR_RING[color] || 'ring-white/30'
            } ${activeColor === color ? 'scale-125 ring-offset-1 ring-offset-black/80' : 'hover:scale-110'}`}
            style={{ backgroundColor: color, opacity: opacity }}
            title={color}
          />
        ))}

        {/* Separator */}
        <div className="w-px h-5 sm:h-6 bg-white/20 mx-0.5 sm:mx-1" />

        {/* Stroke Width */}
        <div className="flex items-center gap-0.5" title="Stroke thickness">
          <button
            type="button"
            onClick={decreaseWidth}
            disabled={currentStepIndex === 0}
            className={`p-1 sm:p-1.5 rounded-lg transition-colors ${
              currentStepIndex > 0
                ? 'text-white/60 hover:text-white hover:bg-white/10'
                : 'text-white/20 cursor-not-allowed'
            }`}
          >
            <Minus className="w-3 h-3" />
          </button>
          <div className="w-5 sm:w-6 flex items-center justify-center" title={`Thickness ${currentStepIndex + 1}/${STROKE_STEPS.length}`}>
            <div
              className="rounded-full bg-white"
              style={{
                width: Math.max(4, 4 + currentStepIndex * 3),
                height: Math.max(4, 4 + currentStepIndex * 3),
              }}
            />
          </div>
          <button
            type="button"
            onClick={increaseWidth}
            disabled={currentStepIndex === STROKE_STEPS.length - 1}
            className={`p-1 sm:p-1.5 rounded-lg transition-colors ${
              currentStepIndex < STROKE_STEPS.length - 1
                ? 'text-white/60 hover:text-white hover:bg-white/10'
                : 'text-white/20 cursor-not-allowed'
            }`}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* Separator */}
        <div className="w-px h-5 sm:h-6 bg-white/20 mx-0.5 sm:mx-1" />

        {/* Opacity */}
        <div className="flex items-center gap-0.5" title="Opacity">
          <button
            type="button"
            onClick={decreaseOpacity}
            disabled={currentOpacityIndex === 0}
            className={`p-1 sm:p-1.5 rounded-lg transition-colors ${
              currentOpacityIndex > 0
                ? 'text-white/60 hover:text-white hover:bg-white/10'
                : 'text-white/20 cursor-not-allowed'
            }`}
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-[10px] text-white/80 font-mono w-7 text-center">
            {Math.round(opacity * 100)}%
          </span>
          <button
            type="button"
            onClick={increaseOpacity}
            disabled={currentOpacityIndex === OPACITY_STEPS.length - 1}
            className={`p-1 sm:p-1.5 rounded-lg transition-colors ${
              currentOpacityIndex < OPACITY_STEPS.length - 1
                ? 'text-white/60 hover:text-white hover:bg-white/10'
                : 'text-white/20 cursor-not-allowed'
            }`}
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Row 2: Actions */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Undo */}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-1.5 sm:p-2 rounded-lg transition-colors flex items-center gap-1 ${
            canUndo
              ? 'text-white/60 hover:text-white hover:bg-white/10'
              : 'text-white/20 cursor-not-allowed'
          }`}
          title="Undo"
        >
          <Undo2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="text-xs">Undo</span>
        </button>

        {/* Separator */}
        <div className="w-px h-5 sm:h-6 bg-white/20 mx-0.5 sm:mx-1" />

        {/* Cancel */}
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 sm:p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1"
          title="Cancel"
        >
          <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="text-xs">Cancel</span>
        </button>

        {/* Separator */}
        <div className="w-px h-5 sm:h-6 bg-white/20 mx-0.5 sm:mx-1" />

        {/* Done */}
        <button
          type="button"
          onClick={onDone}
          disabled={!hasShapes}
          className={`p-1.5 sm:p-2 rounded-lg transition-colors flex items-center gap-1 ${
            hasShapes
              ? 'text-green-400 hover:text-green-300 hover:bg-green-500/20'
              : 'text-white/20 cursor-not-allowed'
          }`}
          title="Save annotation"
        >
          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="text-xs">Done</span>
        </button>
      </div>
    </div>
  )
}
