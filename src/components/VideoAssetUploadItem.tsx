'use client'

import { QueuedUpload } from '@/hooks/useAssetUploadQueue'
import { Button } from './ui/button'
import { formatFileSize } from '@/lib/utils'
import {
  FileIcon,
  FileImage,
  FileVideo,
  FileMusic,
  FileText,
  File,
  FileArchive,
  Pause,
  Play,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCw
} from 'lucide-react'

interface VideoAssetUploadItemProps {
  upload: QueuedUpload
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onRemove: () => void
  onRetry: () => void
}

export function VideoAssetUploadItem({
  upload,
  onPause,
  onResume,
  onCancel,
  onRemove,
  onRetry
}: VideoAssetUploadItemProps) {

  const getFileIcon = () => {
    const fileName = upload.file.name.toLowerCase()
    const fileType = upload.file.type.toLowerCase()
    const category = upload.category?.toLowerCase() || ''

    if (category === 'thumbnail' || fileType.startsWith('image/')) {
      return <FileImage className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    }

    if (category === 'video' || fileType.startsWith('video/')) {
      return <FileVideo className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    }

    if (category === 'audio' || fileType.startsWith('audio/')) {
      return <FileMusic className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    }

    if (
      fileType === 'application/zip' ||
      fileType === 'application/x-zip-compressed' ||
      fileName.endsWith('.zip')
    ) {
      return <FileArchive className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    }

    if (
      category === 'subtitle' ||
      fileName.endsWith('.srt') ||
      fileName.endsWith('.vtt') ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.md')
    ) {
      return <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    }

    return <File className="h-5 w-5 text-muted-foreground flex-shrink-0" />
  }

  const getCategoryLabel = (category: string) => {
    if (!category) return 'Other'
    return category.charAt(0).toUpperCase() + category.slice(1)
  }

  const getStatusIcon = () => {
    switch (upload.status) {
      case 'queued':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      case 'uploading':
        return null // Progress bar shows status
      case 'paused':
        return <Pause className="h-4 w-4 text-warning" />
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-success" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />
      default:
        return null
    }
  }

  const getStatusText = () => {
    switch (upload.status) {
      case 'queued':
        return 'Queued'
      case 'uploading':
        return 'Uploading...'
      case 'paused':
        return 'Paused'
      case 'completed':
        return 'Complete'
      case 'error':
        return 'Failed'
      default:
        return upload.status
    }
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-md border bg-card">
      {/* File icon */}
      <div className="mt-0.5">
        {getFileIcon()}
      </div>

      {/* File info and progress */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* File name and size */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{upload.file.name}</p>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span>{formatFileSize(upload.file.size)}</span>
              <span>•</span>
              <span>{getCategoryLabel(upload.category)}</span>
            </div>
          </div>

          {/* Status badge */}
          <div className="flex items-center gap-1 text-xs font-medium">
            {getStatusIcon()}
            <span className={
              upload.status === 'error' ? 'text-destructive' :
              upload.status === 'completed' ? 'text-success' :
              upload.status === 'paused' ? 'text-warning' :
              'text-muted-foreground'
            }>
              {getStatusText()}
            </span>
          </div>
        </div>

        {/* Progress bar (only for uploading, queued, paused) */}
        {['queued', 'uploading', 'paused'].includes(upload.status) && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {upload.status === 'uploading' && upload.uploadSpeed > 0
                  ? `${upload.uploadSpeed} MB/s`
                  : ' '}
              </span>
              <span className="font-medium">{upload.progress}%</span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full transition-all ${
                  upload.status === 'paused'
                    ? 'bg-warning'
                    : 'bg-primary'
                }`}
                style={{
                  width: `${upload.progress}%`,
                  backgroundImage: upload.status === 'uploading'
                    ? 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.2) 10px, rgba(255,255,255,0.2) 20px)'
                    : 'none',
                  backgroundSize: '28px 28px',
                  animation: upload.status === 'uploading' ? 'move-stripes 1s linear infinite' : 'none'
                }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {upload.status === 'error' && upload.error && (
          <p className="text-xs text-destructive">{upload.error}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {upload.status === 'uploading' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onPause}
            title="Pause upload"
            className="h-8 w-8"
          >
            <Pause className="h-4 w-4" />
          </Button>
        )}

        {upload.status === 'paused' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onResume}
            title="Resume upload"
            className="h-8 w-8"
          >
            <Play className="h-4 w-4" />
          </Button>
        )}

        {upload.status === 'error' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRetry}
            title="Retry upload"
            className="h-8 w-8"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
        )}

        {['queued', 'uploading', 'paused', 'error'].includes(upload.status) && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCancel}
            title="Cancel upload"
            className="h-8 w-8 text-destructive hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        {upload.status === 'completed' && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            title="Remove from list"
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
