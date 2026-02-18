'use client'

import { useState, useRef, useCallback } from 'react'
import { Paperclip, Loader2, CheckCircle2, AlertCircle, Upload, X, FileIcon } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'

interface PendingAttachment {
  assetId: string
  videoId: string
  fileName: string
  fileSize: string
  fileType: string
  category: string
}

interface CommentAttachmentButtonProps {
  videoId: string
  shareToken: string | null
  onAttachmentAdded: (attachment: PendingAttachment) => void
  onUploadError?: (message: string | null) => void
  disabled?: boolean
}

interface FileUploadItem {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'completed' | 'error'
  error?: string
}

const MAX_FILES = 10

// All allowed extensions from ALLOWED_ASSET_TYPES in file-validation.ts
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff',
  '.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma',
  '.mp4', '.mov', '.avi', '.mkv', '.mxf', '.prores',
  '.srt', '.vtt', '.ass', '.ssa', '.sub',
  '.prproj', '.aep', '.fcp', '.drp', '.drt', '.dra',
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.pdf', '.doc', '.docx', '.txt', '.rtf',
])

const ACCEPTED_INPUT = Array.from(ALLOWED_EXTENSIONS).join(',')

const ALLOWED_TYPES_DISPLAY = 'Images, audio, video, documents, subtitles, project files, and archives'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filename.slice(lastDot).toLowerCase()
}

function validateFile(file: File): string | null {
  const ext = getFileExtension(file.name)
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return `Unsupported file type (${ext || 'no extension'})`
  }
  return null
}

export default function CommentAttachmentButton({
  videoId,
  shareToken,
  onAttachmentAdded,
  onUploadError,
  disabled = false,
}: CommentAttachmentButtonProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<FileUploadItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadingRef = useRef(false)

  const allDone = items.length > 0 && items.every((i) => i.status === 'completed' || i.status === 'error')
  const hasFiles = items.length > 0
  const atLimit = items.length >= MAX_FILES

  const addFiles = useCallback((files: FileList | File[]) => {
    setItems((prev) => {
      const remaining = MAX_FILES - prev.length
      if (remaining <= 0) return prev
      const newFiles = Array.from(files).slice(0, remaining)
      const newItems: FileUploadItem[] = newFiles.map((file) => {
        const error = validateFile(file)
        return {
          id: crypto.randomUUID(),
          file,
          status: error ? 'error' as const : 'pending' as const,
          error: error || undefined,
        }
      })
      return [...prev, ...newItems]
    })
  }, [])

  const removeFile = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const uploadFile = async (item: FileUploadItem): Promise<boolean> => {
    const formData = new FormData()
    formData.append('file', item.file)

    const headers: Record<string, string> = {}
    if (shareToken) {
      headers['Authorization'] = `Bearer ${shareToken}`
    }

    try {
      const response = await fetch(`/api/videos/${videoId}/client-assets`, {
        method: 'POST',
        headers,
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `Upload failed`)
      }

      const data = await response.json()
      onAttachmentAdded({
        assetId: data.assetId,
        videoId,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
        category: data.category,
      })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed'
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: message } : i))
      )
      return false
    }
  }

  const startUpload = async () => {
    const pending = items.filter((i) => i.status === 'pending')
    if (pending.length === 0) return

    setIsUploading(true)
    uploadingRef.current = true
    onUploadError?.(null)
    setUploadProgress({ current: 0, total: pending.length })

    for (let idx = 0; idx < pending.length; idx++) {
      const item = pending[idx]
      setUploadProgress({ current: idx + 1, total: pending.length })

      // Mark as uploading
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading' } : i))
      )

      const success = await uploadFile(item)
      if (success) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'completed' } : i))
        )
      }
    }

    setIsUploading(false)
    uploadingRef.current = false
  }

  const handleDone = () => {
    setOpen(false)
    setItems([])
    setUploadProgress({ current: 0, total: 0 })
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && isUploading) {
      // Allow closing during upload — uploads continue in background via refs
    }
    setOpen(next)
    if (!next && !uploadingRef.current) {
      setItems([])
      setUploadProgress({ current: 0, total: 0 })
    }
  }

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!atLimit && !isUploading) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (!atLimit && !isUploading && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }

  const handleBrowse = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files)
    }
    e.target.value = ''
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="self-end text-muted-foreground hover:text-foreground"
        title="Attach files"
      >
        <Paperclip className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Attach Files</DialogTitle>
          </DialogHeader>

          {/* Drop zone */}
          {!isUploading && !allDone && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-all cursor-pointer
                ${atLimit
                  ? 'border-muted bg-muted/30 cursor-not-allowed opacity-50'
                  : isDragging
                    ? 'border-primary bg-primary/5 scale-[1.01]'
                    : 'border-muted-foreground/25 hover:border-primary/50'
                }
              `}
              onClick={atLimit ? undefined : handleBrowse}
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                {atLimit
                  ? 'Maximum files reached'
                  : 'Drag & drop files here or click to browse'}
              </p>
              <p className="text-xs text-muted-foreground/60 text-center">
                {ALLOWED_TYPES_DISPLAY}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ACCEPTED_INPUT}
                multiple
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* Upload progress summary */}
          {isUploading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading {uploadProgress.current} of {uploadProgress.total}...
            </p>
          )}

          {allDone && (
            <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              All files uploaded
            </p>
          )}

          {/* File list */}
          {hasFiles && (
            <div className="max-h-60 overflow-y-auto space-y-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm bg-muted/50"
                >
                  {/* Status icon */}
                  {item.status === 'pending' && (
                    <FileIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
                  )}
                  {item.status === 'uploading' && (
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin text-primary" />
                  )}
                  {item.status === 'completed' && (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />
                  )}
                  {item.status === 'error' && (
                    <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
                  )}

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{item.file.name}</p>
                    {item.status === 'error' && item.error && (
                      <p className="text-xs text-destructive truncate">{item.error}</p>
                    )}
                  </div>

                  {/* File size */}
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatFileSize(item.file.size)}
                  </span>

                  {/* Remove button (pending or errored files) */}
                  {(item.status === 'pending' || item.status === 'error') && (
                    <button
                      type="button"
                      onClick={() => removeFile(item.id)}
                      className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
            <span className="text-sm text-muted-foreground">
              {items.length}/{MAX_FILES}
            </span>
            {allDone ? (
              <Button onClick={handleDone}>Done</Button>
            ) : (
              <Button
                onClick={startUpload}
                disabled={!hasFiles || isUploading || items.every((i) => i.status !== 'pending')}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Upload'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
