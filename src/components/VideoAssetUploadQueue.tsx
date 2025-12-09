'use client'

import { useState, useRef } from 'react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Input } from './ui/input'
import { Upload, Trash2 } from 'lucide-react'
import { useAssetUploadQueue } from '@/hooks/useAssetUploadQueue'
import { VideoAssetUploadItem } from './VideoAssetUploadItem'
import { ALLOWED_ASSET_EXTENSIONS, validateAssetExtension, detectAssetCategory } from '@/lib/asset-validation'

interface VideoAssetUploadQueueProps {
  videoId: string
  onUploadComplete?: () => void
  maxConcurrent?: number
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'Other' },
  { value: 'thumbnail', label: 'Thumbnail (JPG, PNG only)' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video (B-roll, Uncut, Extras)' },
  { value: 'audio', label: 'Audio/Music' },
  { value: 'subtitle', label: 'Subtitles/Captions' },
  { value: 'project', label: 'Project File (Premiere, DaVinci, Final Cut)' },
  { value: 'document', label: 'Document' },
]

export function VideoAssetUploadQueue({
  videoId,
  onUploadComplete,
  maxConcurrent = 3
}: VideoAssetUploadQueueProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [category, setCategory] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const {
    queue,
    stats,
    addToQueue,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    removeCompleted,
    clearCompleted,
    retryUpload,
  } = useAssetUploadQueue({
    videoId,
    maxConcurrent,
    onUploadComplete,
  })

  const handleFileSelect = (file: File | null) => {
    setSelectedFile(file)
    setError(null)
    if (file) {
      // Only auto-detect category if user hasn't manually selected one
      if (!category) {
        const detectedCategory = detectAssetCategory(file.name)
        setCategory(detectedCategory)
      }
    } else {
      setCategory('')
    }
  }

  function validateAssetFile(file: File): { valid: boolean; error?: string } {
    if (file.size === 0) {
      return { valid: false, error: 'File is empty' }
    }

    return validateAssetExtension(file.name, category)
  }

  const handleAddToQueue = () => {
    if (!selectedFile) return

    // Validate file type
    const validation = validateAssetFile(selectedFile)
    if (!validation.valid) {
      setError(validation.error || 'Invalid file type')
      return
    }

    // Add to queue
    addToQueue(selectedFile, category || '')

    // Reset form
    setSelectedFile(null)
    setCategory('')
    setError(null)

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Drag and drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0]
      handleFileSelect(droppedFile)
    }
  }

  const hasActiveUploads = stats.uploading > 0 || stats.queued > 0 || stats.paused > 0

  return (
    <div className="space-y-4">
      {/* File selection area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          space-y-4 rounded-lg border-2 border-dashed transition-all
          ${isDragging
            ? 'border-primary bg-primary/5 scale-[1.01] p-4'
            : 'border-transparent'
          }
        `}
      >
        {/* Error Message */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Category Selection */}
        <div className="space-y-2">
          <Label htmlFor={`category-${videoId}`}>Category (Optional)</Label>
          <select
            id={`category-${videoId}`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* File Selection */}
        <div className="space-y-2">
          <Label htmlFor={`asset-file-${videoId}`}>Asset File</Label>
          <div className="flex items-center gap-2">
            <Input
              ref={fileInputRef}
              id={`asset-file-${videoId}`}
              type="file"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              {selectedFile ? 'Change File' : 'Drag & Drop or Click to Choose'}
            </Button>
          </div>
          {selectedFile && (
            <p className="text-sm text-muted-foreground">
              Selected: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
            </p>
          )}
        </div>

        {/* Add to Queue Button */}
        {selectedFile && (
          <Button
            type="button"
            onClick={handleAddToQueue}
            className="w-full"
          >
            <Upload className="w-4 h-4 mr-2" />
            Add to Upload Queue
          </Button>
        )}
      </div>

      {/* Queue Statistics */}
      {queue.length > 0 && (
        <div className="flex items-center justify-between p-3 rounded-md border bg-muted/50">
          <div className="flex gap-4 text-sm">
            {stats.uploading > 0 && (
              <span className="font-medium text-primary">
                {stats.uploading} uploading
              </span>
            )}
            {stats.queued > 0 && (
              <span className="text-muted-foreground">
                {stats.queued} queued
              </span>
            )}
            {stats.paused > 0 && (
              <span className="text-warning">
                {stats.paused} paused
              </span>
            )}
            {stats.completed > 0 && (
              <span className="text-success">
                {stats.completed} completed
              </span>
            )}
            {stats.error > 0 && (
              <span className="text-destructive">
                {stats.error} failed
              </span>
            )}
          </div>

          {stats.completed > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearCompleted}
              className="text-xs"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear Completed
            </Button>
          )}
        </div>
      )}

      {/* Upload Queue List */}
      {queue.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-sm font-medium text-muted-foreground">
            Upload Queue ({queue.length})
          </h5>
          <div className="space-y-2">
            {queue.map((upload) => (
              <VideoAssetUploadItem
                key={upload.id}
                upload={upload}
                onPause={() => pauseUpload(upload.id)}
                onResume={() => resumeUpload(upload.id)}
                onCancel={() => cancelUpload(upload.id)}
                onRemove={() => removeCompleted(upload.id)}
                onRetry={() => retryUpload(upload.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Info message when queue is empty */}
      {queue.length === 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          Select files above to add them to the upload queue. You can upload up to {maxConcurrent} files simultaneously.
        </div>
      )}
    </div>
  )
}
