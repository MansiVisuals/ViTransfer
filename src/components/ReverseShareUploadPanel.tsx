'use client'

import { useState, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Upload, Loader2, CheckCircle2, AlertCircle, FileIcon, X, RotateCcw, FolderUp } from 'lucide-react'
import { formatFileSize } from '@/lib/utils'
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
import { ALL_ALLOWED_EXTENSIONS, ACCEPTED_FILE_INPUT } from '@/lib/asset-validation'

const ALLOWED_EXTENSIONS = new Set(ALL_ALLOWED_EXTENSIONS)

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  return lastDot === -1 ? '' : filename.slice(lastDot).toLowerCase()
}

interface FileItem {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'completed' | 'error'
  progress: number
  error?: string
  uploadId?: string
}

interface ReverseShareUploadPanelProps {
  shareToken: string
  shareSlug: string
  maxFiles?: number
}

const DEFAULT_MAX_FILES = 10

export default function ReverseShareUploadPanel({
  shareToken,
  shareSlug,
  maxFiles: maxFilesProp,
}: ReverseShareUploadPanelProps) {
  const t = useTranslations('share')
  const tc = useTranslations('common')
  const MAX_FILES = maxFilesProp ?? DEFAULT_MAX_FILES

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<FileItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [allDone, setAllDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tusUploadsRef = useRef<Map<string, tus.Upload>>(new Map())
  const s3AbortKeysRef = useRef<Map<string, string>>(new Map())
  const { startUpload: startS3Upload, abortUpload: abortS3Upload } = useS3MultipartUpload()
  const storageProvider = useStorageProvider()

  const atLimit = items.length >= MAX_FILES
  const hasFiles = items.length > 0
  const hasPending = items.some((i) => i.status === 'pending')

  const addFiles = useCallback((files: FileList | File[]) => {
    setAllDone(false)
    setItems((prev) => {
      const remaining = MAX_FILES - prev.length
      if (remaining <= 0) return prev
      return [
        ...prev,
        ...Array.from(files).slice(0, remaining).map((file) => {
          const ext = getFileExtension(file.name)
          const error = !ext || !ALLOWED_EXTENSIONS.has(ext) ? `Unsupported file type (${ext || 'no extension'})` : null
          return {
            id: crypto.randomUUID(),
            file,
            status: error ? 'error' as const : 'pending' as const,
            progress: 0,
            error: error || undefined,
          }
        }),
      ]
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
      const tusUpload = tusUploadsRef.current.get(id)
      if (tusUpload) {
        tusUpload.abort(true)
        tusUploadsRef.current.delete(id)
      }
    }
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [abortS3Upload, storageProvider])

  const retryFile = useCallback((id: string) => {
    setAllDone(false)
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: 'pending', error: undefined, progress: 0, uploadId: undefined } : i))
    )
  }, [])

  const uploadFile = async (item: FileItem): Promise<boolean> => {
    let uploadId: string

    try {
      const response = await fetch(`/api/share/${shareSlug}/project-uploads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${shareToken}`,
        },
        body: JSON.stringify({ fileName: item.file.name, fileSize: item.file.size }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create upload record')
      }

      const data = await response.json()
      uploadId = data.uploadId
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create upload record'
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: message } : i)))
      return false
    }

    return new Promise<boolean>((resolve) => {
      if (storageProvider === 's3') {
        // ── S3 direct multipart upload ──────────────────────────────────────
        const s3Key = `s3-rev-share-${item.id}`
        s3AbortKeysRef.current.set(item.id, s3Key)
        startS3Upload(
          item.file,
          { projectUploadId: uploadId, bearerToken: shareToken },
          {
            onProgress: (bytesUploaded, bytesTotal) => {
              const pct = Math.round((bytesUploaded / bytesTotal) * 100)
              setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, progress: pct } : i)))
            },
            onSuccess: () => {
              setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'completed', progress: 100, uploadId } : i)))
              s3AbortKeysRef.current.delete(item.id)
              clearFileContext(item.file)
              clearUploadMetadata(item.file)
              resolve(true)
            },
            onError: (err) => {
              setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: err.message, uploadId } : i)))
              s3AbortKeysRef.current.delete(item.id)
              clearUploadMetadata(item.file)
              fetch(`/api/share/${shareSlug}/project-uploads?uploadId=${uploadId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${shareToken}` },
              }).catch(() => {})
              resolve(false)
            },
          },
          s3Key
        )
      } else {
        // ── TUS resumable upload ─────────────────────────────────────────────
        ensureFreshUploadOnContextChange(item.file, `reverse-share:${shareSlug}:${uploadId}`)

      const tusUpload = new tus.Upload(item.file, {
        endpoint: `${window.location.origin}/api/uploads`,
        retryDelays: TUS_RETRY_DELAYS_MS,
        metadata: {
          filename: item.file.name,
          filetype: item.file.type || 'application/octet-stream',
          projectUploadId: uploadId,
        },
        chunkSize: getTusChunkSizeBytes(item.file.size),
        storeFingerprintForResuming: true,
        removeFingerprintOnSuccess: true,

        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = Math.round((bytesUploaded / bytesTotal) * 100)
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, progress: percentage } : i)))
        },

        onSuccess: () => {
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'completed', progress: 100, uploadId } : i)))
          tusUploadsRef.current.delete(item.id)
          clearFileContext(item.file)
          clearUploadMetadata(item.file)
          clearTUSFingerprint(item.file)
          resolve(true)
        },

        onError: (error) => {
          const errorMessage = getTusUploadErrorMessage(error)
          setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: errorMessage, uploadId } : i)))
          tusUploadsRef.current.delete(item.id)
          clearUploadMetadata(item.file)
          clearTUSFingerprint(item.file)
          fetch(`/api/share/${shareSlug}/project-uploads?uploadId=${uploadId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${shareToken}` },
          }).catch(() => {})
          resolve(false)
        },

        onBeforeRequest: (req) => {
          const xhr = req.getUnderlyingObject()
          xhr.withCredentials = true
          xhr.setRequestHeader('Authorization', `Bearer ${shareToken}`)
        },
      })

      tusUploadsRef.current.set(item.id, tusUpload)
      tusUpload.findPreviousUploads().then((previousUploads) => {
        if (previousUploads.length > 0) tusUpload.resumeFromPreviousUpload(previousUploads[0])
        tusUpload.start()
      })
      } // end TUS else block
    })
  }

  const startUpload = async () => {
    const pending = items.filter((i) => i.status === 'pending')
    if (pending.length === 0) return
    setIsUploading(true)
    for (const item of pending) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading' } : i)))
      await uploadFile(item)
    }
    setIsUploading(false)
    // Only show success banner when no files ended in error
    setItems((prev) => {
      const hasErrors = prev.some((i) => i.status === 'error')
      setAllDone(!hasErrors)
      return prev
    })
  }

  const handleDone = () => {
    setOpen(false)
    setItems([])
    setAllDone(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && isUploading) return
    setOpen(next)
    if (!next && !isUploading) {
      if (storageProvider === 's3') {
        s3AbortKeysRef.current.forEach((key) => abortS3Upload(key).catch(() => {}))
        s3AbortKeysRef.current.clear()
      } else {
        tusUploadsRef.current.forEach((u) => u.abort(true))
        tusUploadsRef.current.clear()
      }
      setItems([])
      setAllDone(false)
    }
  }

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
    if (!atLimit && !isUploading && e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors shadow-sm flex items-center gap-1.5"
      >
        <FolderUp className="h-5 w-5 text-foreground" />
        <span className="hidden sm:inline text-sm font-medium text-foreground">{t('submitFiles')}</span>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('submitFilesTitle')}</DialogTitle>
          </DialogHeader>

          {/* Drop zone */}
          {!isUploading && !allDone && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={atLimit ? undefined : () => fileInputRef.current?.click()}
              className={`
                flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-all cursor-pointer
                ${atLimit
                  ? 'border-muted bg-muted/30 cursor-not-allowed opacity-50'
                  : isDragging
                    ? 'border-primary bg-primary/5 scale-[1.01]'
                    : 'border-muted-foreground/25 hover:border-primary/50'
                }
              `}
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                {atLimit ? t('maxFilesReached') : t('dragDropFiles')}
              </p>
              <p className="text-xs text-muted-foreground/60 text-center">{t('supportedFileTypes')}</p>
              <input ref={fileInputRef} type="file" className="hidden" accept={ACCEPTED_FILE_INPUT} multiple onChange={handleFileChange} />
            </div>
          )}

          {isUploading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {tc('uploading')}
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
                <div key={item.id} className="flex flex-col rounded-md px-2 py-1.5 text-sm bg-muted/50">
                  <div className="flex items-center gap-2">
                    {item.status === 'pending' && <FileIcon className="w-4 h-4 shrink-0 text-muted-foreground" />}
                    {item.status === 'uploading' && <Loader2 className="w-4 h-4 shrink-0 animate-spin text-primary" />}
                    {item.status === 'completed' && <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />}
                    {item.status === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />}

                    <div className="flex-1 min-w-0">
                      <p className="truncate">{item.file.name}</p>
                      {item.status === 'error' && item.error && (
                        <p className="text-xs text-destructive truncate">{item.error}</p>
                      )}
                    </div>

                    {item.status === 'uploading' && (
                      <span className="text-xs text-primary shrink-0 font-medium">{item.progress}%</span>
                    )}
                    {item.status !== 'uploading' && (
                      <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(item.file.size)}</span>
                    )}

                    {item.status === 'error' && (
                      <button type="button" onClick={() => retryFile(item.id)} className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title={tc('retry')}>
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {(item.status === 'pending' || item.status === 'error') && (
                      <button type="button" onClick={() => removeFile(item.id)} className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {item.status === 'uploading' && (
                    <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${item.progress}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2">
            <span className="text-sm text-muted-foreground">{items.length}/{MAX_FILES}</span>
            {allDone ? (
              <Button onClick={handleDone}>{tc('done')}</Button>
            ) : (
              <Button
                onClick={startUpload}
                disabled={!hasFiles || isUploading || !hasPending}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {tc('uploading')}
                  </>
                ) : (
                  t('submitFiles')
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
