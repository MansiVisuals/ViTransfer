'use client'

import { useState, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Paperclip, Loader2, CheckCircle2, AlertCircle, Upload, X, FileIcon, RotateCcw } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'
import * as tus from 'tus-js-client'
import { getTusUploadErrorMessage } from '@/lib/tus-error'
import { getTusChunkSizeBytes, TUS_RETRY_DELAYS_MS } from '@/lib/transfer-tuning'
import {
  ensureFreshUploadOnContextChange,
  clearFileContext,
  clearUploadMetadata,
  clearTUSFingerprint,
} from '@/lib/tus-context'
import { useS3MultipartUpload } from '@/hooks/useS3MultipartUpload'
import { useStorageProvider } from '@/components/StorageConfigProvider'
import { formatFileSize } from '@/lib/utils'
import { ALL_ALLOWED_EXTENSIONS, ACCEPTED_FILE_INPUT } from '@/lib/asset-validation'

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
  maxFiles?: number
}

interface FileUploadItem {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'completed' | 'error'
  progress: number
  error?: string
  assetId?: string
  tusUpload?: tus.Upload
}

const DEFAULT_MAX_FILES = 10

const ALLOWED_EXTENSIONS = new Set(ALL_ALLOWED_EXTENSIONS)

const ALLOWED_TYPES_DISPLAY = 'Images, audio, video, documents, subtitles, project files, and archives'

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
  maxFiles: maxFilesProp,
}: CommentAttachmentButtonProps) {
  const t = useTranslations('comments')
  const tc = useTranslations('common')
  const MAX_FILES = maxFilesProp ?? DEFAULT_MAX_FILES
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<FileUploadItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadingRef = useRef(false)
  const tusUploadsRef = useRef<Map<string, tus.Upload>>(new Map())
  const s3AbortKeysRef = useRef<Map<string, string>>(new Map())
  const { startUpload: startS3Upload, abortUpload: abortS3Upload } = useS3MultipartUpload()
  const storageProvider = useStorageProvider()

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
          progress: 0,
          error: error || undefined,
        }
      })
      return [...prev, ...newItems]
    })
  }, [MAX_FILES])

  const removeFile = useCallback((id: string) => {
    if (storageProvider === 's3') {
      const s3Key = s3AbortKeysRef.current.get(id)
      if (s3Key) {
        abortS3Upload(s3Key).catch(() => {})
        s3AbortKeysRef.current.delete(id)
      }
    } else {
      // Abort any in-progress TUS upload
      const tusUpload = tusUploadsRef.current.get(id)
      if (tusUpload) {
        tusUpload.abort(true)
        tusUploadsRef.current.delete(id)
      }
    }
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [abortS3Upload])

  const uploadFile = async (item: FileUploadItem): Promise<boolean> => {
    // Step 1: Create asset record via JSON POST
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (shareToken) {
      headers['Authorization'] = `Bearer ${shareToken}`
    }

    let assetId: string
    let fileName: string
    let category: string

    try {
      const response = await fetch(`/api/videos/${videoId}/client-assets`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fileName: item.file.name,
          fileSize: item.file.size,
          category: undefined,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || t('failedToCreateAsset'))
      }

      const data = await response.json()
      assetId = data.assetId
      fileName = data.fileName
      category = data.category
    } catch (error) {
      const message = error instanceof Error ? error.message : t('failedToCreateAsset')
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: message } : i))
      )
      return false
    }

    // Step 2: Upload file — S3 direct or TUS
    return new Promise<boolean>((resolve) => {
      if (storageProvider === 's3') {
        // ── S3 direct multipart upload ──────────────────────────────
        const s3Key = `s3-comment-${item.id}`
        s3AbortKeysRef.current.set(item.id, s3Key)
        startS3Upload(
          item.file,
          { assetId, bearerToken: shareToken || undefined },
          {
            onProgress: (bytesUploaded, bytesTotal) => {
              const pct = Math.round((bytesUploaded / bytesTotal) * 100)
              setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, progress: pct } : i)))
            },
            onSuccess: () => {
              setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'completed', progress: 100, assetId } : i)))
              s3AbortKeysRef.current.delete(item.id)
              clearFileContext(item.file)
              clearUploadMetadata(item.file)
              onAttachmentAdded({ assetId, videoId, fileName, fileSize: item.file.size.toString(), fileType: item.file.type || 'application/octet-stream', category })
              resolve(true)
            },
            onError: (err) => {
              setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: err.message, assetId } : i)))
              s3AbortKeysRef.current.delete(item.id)
              clearUploadMetadata(item.file)
              const deleteHeaders: Record<string, string> = {}
              if (shareToken) deleteHeaders['Authorization'] = `Bearer ${shareToken}`
              fetch(`/api/videos/${videoId}/client-assets?assetId=${assetId}`, { method: 'DELETE', headers: deleteHeaders }).catch(() => {})
              resolve(false)
            },
          },
          s3Key
        )
      } else {
        // ── TUS resumable upload ──────────────────────────────────────
        // Ensure fresh upload context
        ensureFreshUploadOnContextChange(item.file, `client:${videoId}:${assetId}`)

      const tusUpload = new tus.Upload(item.file, {
        endpoint: `${window.location.origin}/api/uploads`,
        retryDelays: TUS_RETRY_DELAYS_MS,
        metadata: {
          filename: item.file.name,
          filetype: item.file.type || 'application/octet-stream',
          assetId: assetId,
        },
        chunkSize: getTusChunkSizeBytes(item.file.size),
        storeFingerprintForResuming: true,
        removeFingerprintOnSuccess: true,

        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = Math.round((bytesUploaded / bytesTotal) * 100)
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, progress: percentage } : i))
          )
        },

        onSuccess: () => {
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, status: 'completed', progress: 100, assetId } : i))
          )

          tusUploadsRef.current.delete(item.id)
          clearFileContext(item.file)
          clearUploadMetadata(item.file)
          clearTUSFingerprint(item.file)

          onAttachmentAdded({
            assetId,
            videoId,
            fileName,
            fileSize: item.file.size.toString(),
            fileType: item.file.type || 'application/octet-stream',
            category,
          })

          resolve(true)
        },

        onError: (error) => {
          const errorMessage = getTusUploadErrorMessage(error)

          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: errorMessage, assetId } : i))
          )

          tusUploadsRef.current.delete(item.id)
          clearUploadMetadata(item.file)
          clearTUSFingerprint(item.file)

          // Try to clean up the asset record on failure
          const deleteHeaders: Record<string, string> = {}
          if (shareToken) {
            deleteHeaders['Authorization'] = `Bearer ${shareToken}`
          }
          fetch(`/api/videos/${videoId}/client-assets?assetId=${assetId}`, {
            method: 'DELETE',
            headers: deleteHeaders,
          }).catch(() => {})

          resolve(false)
        },

        onBeforeRequest: (req) => {
          const xhr = req.getUnderlyingObject()
          xhr.withCredentials = true

          // Use share token for auth
          if (shareToken) {
            xhr.setRequestHeader('Authorization', `Bearer ${shareToken}`)
          }
        },
      })

      tusUploadsRef.current.set(item.id, tusUpload)

      // Check for previous uploads to resume
      tusUpload.findPreviousUploads().then((previousUploads) => {
        if (previousUploads.length > 0) {
          tusUpload.resumeFromPreviousUpload(previousUploads[0])
        }
        tusUpload.start()
      })
      } // end TUS else block
    })
  }

  const retryFile = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: 'pending', error: undefined, progress: 0, assetId: undefined } : i))
    )
  }, [])

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

      await uploadFile(item)
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
      // Abort any remaining uploads
      tusUploadsRef.current.forEach((upload) => upload.abort(true))
      tusUploadsRef.current.clear()
      s3AbortKeysRef.current.forEach((key) => abortS3Upload(key).catch(() => {}))
      s3AbortKeysRef.current.clear()
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
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="h-8 w-8 flex-shrink-0"
        title={t('attachFiles')}
      >
        <Paperclip className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('attachFilesTitle')}</DialogTitle>
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
                  ? t('maxFilesReached')
                  : t('dragDropFiles')}
              </p>
              <p className="text-xs text-muted-foreground/60 text-center">
                {t('supportedFileTypes')}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ACCEPTED_FILE_INPUT}
                multiple
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* Upload progress summary */}
          {isUploading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {tc('loading')} {uploadProgress.current}/{uploadProgress.total}
            </p>
          )}

          {allDone && (
            <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {t('allFilesUploaded')}
            </p>
          )}

          {/* File list */}
          {hasFiles && (
            <div className="max-h-60 overflow-y-auto space-y-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col rounded-md px-2 py-1.5 text-sm bg-muted/50"
                >
                  <div className="flex items-center gap-2">
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

                    {/* Progress percentage for uploading files */}
                    {item.status === 'uploading' && (
                      <span className="text-xs text-primary shrink-0 font-medium">
                        {item.progress}%
                      </span>
                    )}

                    {/* File size */}
                    {item.status !== 'uploading' && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatFileSize(item.file.size)}
                      </span>
                    )}

                    {/* Retry button (errored files) */}
                    {item.status === 'error' && (
                      <button
                        type="button"
                        onClick={() => retryFile(item.id)}
                        className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title={tc('retry')}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}

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

                  {/* Progress bar for uploading files */}
                  {item.status === 'uploading' && (
                    <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
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
              <Button onClick={handleDone}>{tc('done')}</Button>
            ) : (
              <Button
                onClick={startUpload}
                disabled={!hasFiles || isUploading || items.every((i) => i.status !== 'pending')}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {tc('loading')}
                  </>
                ) : (
                  tc('upload')
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
