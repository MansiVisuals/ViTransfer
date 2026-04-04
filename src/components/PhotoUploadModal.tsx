'use client'

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Upload, Image, X, CheckCircle2, Pause, Play } from 'lucide-react'
import { cn, formatFileSize } from '@/lib/utils'
import * as tus from 'tus-js-client'
import { apiPost, apiDelete } from '@/lib/api-client'
import { getAccessToken } from '@/lib/token-store'
import { getTusUploadErrorMessage, createTusAfterResponseHandler, createTusShouldRetryHandler, resetTusAuthRetry } from '@/lib/tus-error'
import { getTusChunkSizeBytes, TUS_RETRY_DELAYS_MS } from '@/lib/transfer-tuning'
import { useStorageProvider } from '@/components/StorageConfigProvider'
import { useS3MultipartUpload } from '@/hooks/useS3MultipartUpload'
import { ALLOWED_PHOTO_EXTENSIONS } from '@/lib/file-validation'

interface PendingUpload {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'completed' | 'error'
  progress: number
  speed: number
  error?: string
  photoId?: string
  paused?: boolean
}

interface PhotoUploadModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  onUploadComplete: () => void
}

export function PhotoUploadModal({ isOpen, onClose, projectId, onUploadComplete }: PhotoUploadModalProps) {
  const storageProvider = useStorageProvider()
  const { startUpload: startS3Upload, abortUpload: abortS3Upload } = useS3MultipartUpload()
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadRefs = useRef<Map<string, tus.Upload>>(new Map())
  const s3UploadKeys = useRef<Map<string, string>>(new Map())

  const MAX_FILENAME_DISPLAY_LENGTH = 38

  const truncateFilename = (filename: string, maxLength: number): string => {
    if (filename.length <= maxLength) return filename
    const ext = filename.lastIndexOf('.') > 0 ? filename.slice(filename.lastIndexOf('.')) : ''
    const nameWithoutExt = filename.slice(0, filename.lastIndexOf('.') > 0 ? filename.lastIndexOf('.') : filename.length)
    const availableLength = maxLength - ext.length - 3
    if (availableLength <= 0) return filename.slice(0, maxLength - 3) + '...'
    return nameWithoutExt.slice(0, availableLength) + '...' + ext
  }

  const acceptedExtensions = ALLOWED_PHOTO_EXTENSIONS.join(',')

  const isValidPhotoFile = (file: File): boolean => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
    return ALLOWED_PHOTO_EXTENSIONS.includes(ext)
  }

  const addFiles = (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(isValidPhotoFile)
    if (validFiles.length === 0) return

    const newUploads: PendingUpload[] = validFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      status: 'pending' as const,
      progress: 0,
      speed: 0,
    }))

    setPendingUploads(prev => [...prev, ...newUploads])
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files)
      e.target.value = ''
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const removeUpload = async (id: string) => {
    const upload = pendingUploads.find(u => u.id === id)
    if (!upload) return

    // Abort active upload
    const tusUpload = uploadRefs.current.get(id)
    if (tusUpload) {
      tusUpload.abort()
      uploadRefs.current.delete(id)
    }

    const s3Key = s3UploadKeys.current.get(id)
    if (s3Key) {
      abortS3Upload(s3Key)
      s3UploadKeys.current.delete(id)
    }

    // Clean up photo record if created
    if (upload.photoId) {
      try { await apiDelete(`/api/photos/${upload.photoId}`) } catch {}
    }

    setPendingUploads(prev => prev.filter(u => u.id !== id))
  }

  const startUploadForItem = async (item: PendingUpload) => {
    setPendingUploads(prev =>
      prev.map(u => u.id === item.id ? { ...u, status: 'uploading' as const, error: undefined } : u)
    )

    try {
      // Step 1: Create photo record
      const { photoId } = await apiPost('/api/photos', {
        projectId,
        originalFileName: item.file.name,
        originalFileSize: item.file.size,
        mimeType: item.file.type || 'application/octet-stream',
      })

      setPendingUploads(prev =>
        prev.map(u => u.id === item.id ? { ...u, photoId } : u)
      )

      // Step 2: Upload file
      if (storageProvider === 's3') {
        const key = `s3-photo-${photoId}`
        s3UploadKeys.current.set(item.id, key)

        await startS3Upload(
          item.file,
          { photoId },
          {
            onProgress: (bytesUploaded, bytesTotal) => {
              const percentage = Math.round((bytesUploaded / bytesTotal) * 100)
              setPendingUploads(prev =>
                prev.map(u => u.id === item.id ? { ...u, progress: percentage } : u)
              )
            },
            onSuccess: () => {
              setPendingUploads(prev =>
                prev.map(u => u.id === item.id ? { ...u, status: 'completed' as const, progress: 100 } : u)
              )
              s3UploadKeys.current.delete(item.id)
              onUploadComplete()
            },
            onError: async (err) => {
              setPendingUploads(prev =>
                prev.map(u => u.id === item.id ? { ...u, status: 'error' as const, error: err.message } : u)
              )
              s3UploadKeys.current.delete(item.id)
            },
          },
          key
        )
      } else {
        // TUS upload
        await new Promise<void>((resolve, reject) => {
          const tusRef: { current: object | null } = { current: null }
          resetTusAuthRetry(null)
          let lastLoaded = 0
          let lastTime = Date.now()

          const upload = new tus.Upload(item.file, {
            endpoint: '/api/uploads',
            retryDelays: TUS_RETRY_DELAYS_MS,
            chunkSize: getTusChunkSizeBytes(item.file.size),
            metadata: {
              photoId,
              filename: item.file.name,
              filetype: item.file.type || 'application/octet-stream',
            },
            headers: {
              Authorization: `Bearer ${getAccessToken()}`,
            },
            onProgress: (bytesUploaded, bytesTotal) => {
              const percentage = Math.round((bytesUploaded / bytesTotal) * 100)
              const now = Date.now()
              const timeDiff = (now - lastTime) / 1000
              const bytesDiff = bytesUploaded - lastLoaded
              let speed = 0
              if (timeDiff > 0.5) {
                const speedMBps = (bytesDiff / timeDiff) / (1024 * 1024)
                speed = speedMBps > 0.05 ? Math.round(speedMBps * 10) / 10 : 0
                lastLoaded = bytesUploaded
                lastTime = now
              }
              setPendingUploads(prev =>
                prev.map(u => u.id === item.id ? { ...u, progress: percentage, speed } : u)
              )
            },
            onSuccess: () => {
              uploadRefs.current.delete(item.id)
              setPendingUploads(prev =>
                prev.map(u => u.id === item.id ? { ...u, status: 'completed' as const, progress: 100 } : u)
              )
              onUploadComplete()
              resolve()
            },
            onError: (err) => {
              uploadRefs.current.delete(item.id)
              const errorMessage = getTusUploadErrorMessage(err)
              setPendingUploads(prev =>
                prev.map(u => u.id === item.id ? { ...u, status: 'error' as const, error: errorMessage } : u)
              )
              reject(new Error(errorMessage))
            },
            onAfterResponse: createTusAfterResponseHandler(tusRef),
            onShouldRetry: createTusShouldRetryHandler(tusRef),
          })

          tusRef.current = upload
          uploadRefs.current.set(item.id, upload)
          upload.start()
        })
      }
    } catch (error: any) {
      setPendingUploads(prev =>
        prev.map(u => u.id === item.id ? { ...u, status: 'error' as const, error: error.message || 'Upload failed' } : u)
      )
    }
  }

  const startAllUploads = () => {
    const pending = pendingUploads.filter(u => u.status === 'pending')
    pending.forEach(item => startUploadForItem(item))
  }

  const allDone = pendingUploads.length > 0 && pendingUploads.every(u => u.status === 'completed')
  const hasUploading = pendingUploads.some(u => u.status === 'uploading')
  const hasPending = pendingUploads.some(u => u.status === 'pending')

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPendingUploads([])
      uploadRefs.current.clear()
      s3UploadKeys.current.clear()
    }
  }, [isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !hasUploading) onClose() }}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image className="w-5 h-5" />
            Upload Photos
          </DialogTitle>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
            isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
          )}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag & drop photos or click to browse
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            JPG, PNG, WebP, GIF, TIFF, BMP, RAW formats
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedExtensions}
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Upload list */}
        {pendingUploads.length > 0 && (
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {pendingUploads.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2 rounded-lg border bg-card text-sm"
              >
                <Image className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium" title={item.file.name}>
                    {truncateFilename(item.file.name, MAX_FILENAME_DISPLAY_LENGTH)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(Number(item.file.size))}
                    {item.speed > 0 && ` · ${item.speed} MB/s`}
                  </p>
                  {item.status === 'uploading' && (
                    <div className="w-full bg-muted rounded-full h-1 mt-1">
                      <div
                        className="bg-primary h-1 rounded-full transition-all"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                  {item.error && (
                    <p className="text-xs text-destructive mt-1">{item.error}</p>
                  )}
                </div>
                {item.status === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : (
                  <button
                    onClick={() => removeUpload(item.id)}
                    className="p-1 hover:bg-muted rounded flex-shrink-0"
                    disabled={item.status === 'uploading'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          {allDone ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={hasUploading}>
                Cancel
              </Button>
              {hasPending && (
                <Button onClick={startAllUploads} disabled={hasUploading}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload {pendingUploads.filter(u => u.status === 'pending').length} photo{pendingUploads.filter(u => u.status === 'pending').length !== 1 ? 's' : ''}
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
