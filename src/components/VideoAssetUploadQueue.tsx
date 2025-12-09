'use client'

import { useState, useRef } from 'react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Input } from './ui/input'
import { Upload, Trash2 } from 'lucide-react'
import { useAssetUploadQueue } from '@/hooks/useAssetUploadQueue'
import { VideoAssetUploadItem } from './VideoAssetUploadItem'
import { validateAssetExtension, detectAssetCategory } from '@/lib/asset-validation'

interface VideoAssetUploadQueueProps {
  videoId: string
  onUploadComplete?: () => void
  maxConcurrent?: number
}

export function VideoAssetUploadQueue({
  videoId,
  onUploadComplete,
  maxConcurrent = 3
}: VideoAssetUploadQueueProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
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

  const handleFileSelect = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) {
      setSelectedFiles([])
      setError(null)
      return
    }

    const fileArray = Array.from(files)
    setSelectedFiles(fileArray)
    setError(null)
  }

  function validateAssetFile(file: File): { valid: boolean; error?: string } {
    if (file.size === 0) {
      return { valid: false, error: 'File is empty' }
    }

    // Don't validate against category - just check if file type is allowed
    // This allows mixing different file types
    return validateAssetExtension(file.name)
  }

  const handleAddToQueue = () => {
    if (selectedFiles.length === 0) return

    let hasErrors = false
    const errors: string[] = []

    // Validate and add all files to queue with auto-detected category per file
    selectedFiles.forEach(file => {
      const validation = validateAssetFile(file)
      if (!validation.valid) {
        hasErrors = true
        errors.push(`${file.name}: ${validation.error}`)
      } else {
        // Auto-detect category for each file individually
        const fileCategory = detectAssetCategory(file.name)
        addToQueue(file, fileCategory || '')
      }
    })

    if (hasErrors) {
      setError(errors.join('\n'))
      return
    }

    // Reset form
    setSelectedFiles([])
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
      handleFileSelect(e.dataTransfer.files)
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

        {/* File Selection */}
        <div className="space-y-2">
          <Label htmlFor={`asset-file-${videoId}`}>Asset Files (Multiple)</Label>
          <div className="flex items-center gap-2">
            <Input
              ref={fileInputRef}
              id={`asset-file-${videoId}`}
              type="file"
              multiple
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              {selectedFiles.length > 0 ? 'Change Files' : 'Drag & Drop or Click to Choose'}
            </Button>
          </div>
          {selectedFiles.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Selected: {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} ({(selectedFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(2)} MB total)
            </p>
          )}
        </div>

        {/* Add to Queue Button */}
        {selectedFiles.length > 0 && (
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
