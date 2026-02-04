'use client'

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Upload, Video, X, Plus, Pause, Play, CheckCircle2 } from 'lucide-react'
import { cn, formatFileSize } from '@/lib/utils'
import * as tus from 'tus-js-client'
import { apiPost, apiDelete } from '@/lib/api-client'
import { getAccessToken } from '@/lib/token-store'
import {
  ensureFreshUploadOnContextChange,
  clearFileContext,
  clearTUSFingerprint,
  getUploadMetadata,
  storeUploadMetadata,
  clearUploadMetadata,
} from '@/lib/tus-context'

interface PendingUpload {
  id: string
  file: File
  videoName: string
  versionLabel: string
  status: 'pending' | 'uploading' | 'completed' | 'error'
  progress: number
  speed: number
  error?: string
  videoId?: string
  paused?: boolean
}

interface VideoUploadModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  onUploadComplete: (videoName: string, videoId: string) => void
}

export function VideoUploadModal({ isOpen, onClose, projectId, onUploadComplete }: VideoUploadModalProps) {
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadRefs = useRef<Map<string, tus.Upload>>(new Map())

  // Maximum length for video names (fits comfortably in modal)
  const MAX_VIDEO_NAME_LENGTH = 50
  // Maximum display length for file names before truncation
  const MAX_FILENAME_DISPLAY_LENGTH = 38

  // Truncate filename for display
  const truncateFilename = (filename: string, maxLength: number): string => {
    if (filename.length <= maxLength) return filename
    const ext = filename.lastIndexOf('.') > 0 ? filename.slice(filename.lastIndexOf('.')) : ''
    const nameWithoutExt = filename.slice(0, filename.lastIndexOf('.') > 0 ? filename.lastIndexOf('.') : filename.length)
    const availableLength = maxLength - ext.length - 3 // 3 for "..."
    if (availableLength <= 0) return filename.slice(0, maxLength - 3) + '...'
    return nameWithoutExt.slice(0, availableLength) + '...' + ext
  }

  // Extract video name from filename (remove extension, truncate if needed)
  const getVideoNameFromFile = (file: File): string => {
    const name = file.name
    const lastDot = name.lastIndexOf('.')
    const baseName = lastDot > 0 ? name.substring(0, lastDot) : name
    return baseName.substring(0, MAX_VIDEO_NAME_LENGTH)
  }

  // Validate video file format
  const validateVideoFile = async (file: File): Promise<{ valid: boolean; error?: string }> => {
    if (file.size === 0) {
      return { valid: false, error: 'File is empty' }
    }

    try {
      const headerBytes = await new Promise<Uint8Array>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          if (e.target?.result) {
            resolve(new Uint8Array(e.target.result as ArrayBuffer))
          } else {
            reject(new Error('Failed to read file'))
          }
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsArrayBuffer(file.slice(0, 12))
      })

      if (headerBytes.length < 12) {
        return { valid: false, error: 'File is too small to be a valid video' }
      }

      const ftypSignature = String.fromCharCode(...headerBytes.subarray(4, 8))
      if (ftypSignature === 'ftyp') return { valid: true }

      const mdatSignature = String.fromCharCode(...headerBytes.subarray(4, 8))
      if (mdatSignature === 'mdat') return { valid: true }

      const validAtoms = ['wide', 'free', 'moov']
      const atomType = String.fromCharCode(...headerBytes.subarray(4, 8))
      if (validAtoms.includes(atomType)) return { valid: true }

      return {
        valid: false,
        error: 'File does not appear to be a valid MP4/MOV video.'
      }
    } catch {
      return { valid: false, error: 'Failed to read file. Please try again.' }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
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

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'))
    addFiles(files)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('video/'))
    addFiles(files)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const addFiles = (files: File[]) => {
    if (files.length > 0) {
      const newUploads: PendingUpload[] = files.map(file => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        videoName: getVideoNameFromFile(file),
        versionLabel: '',
        status: 'pending',
        progress: 0,
        speed: 0,
      }))
      setPendingUploads(prev => [...prev, ...newUploads])
    }
  }

  const handleRemove = (id: string) => {
    const upload = uploadRefs.current.get(id)
    if (upload) {
      upload.abort(true)
      uploadRefs.current.delete(id)
    }
    setPendingUploads(prev => prev.filter(u => u.id !== id))
  }

  const handleUpdateName = (id: string, newName: string) => {
    // Enforce max length
    const truncatedName = newName.substring(0, MAX_VIDEO_NAME_LENGTH)
    setPendingUploads(prev => prev.map(u => u.id === id ? { ...u, videoName: truncatedName } : u))
  }

  const handleUpdateVersionLabel = (id: string, newLabel: string) => {
    setPendingUploads(prev => prev.map(u => u.id === id ? { ...u, versionLabel: newLabel } : u))
  }

  const startUpload = async (uploadItem: PendingUpload) => {
    const { id, file, videoName, versionLabel } = uploadItem

    if (!videoName.trim()) {
      setPendingUploads(prev => prev.map(u =>
        u.id === id ? { ...u, status: 'error', error: 'Video name is required' } : u
      ))
      return
    }

    const trimmedVideoName = videoName.trim()
    const trimmedVersionLabel = versionLabel.trim()
    const contextKey = `${projectId}:${trimmedVideoName}:${trimmedVersionLabel || 'auto'}`

    setPendingUploads(prev => prev.map(u =>
      u.id === id ? { ...u, status: 'uploading', progress: 0, error: undefined } : u
    ))

    try {
      // Validate file
      const validation = await validateVideoFile(file)
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid video file')
      }

      // Check context and create video record
      ensureFreshUploadOnContextChange(file, contextKey)

      const existingMetadata = getUploadMetadata(file)
      const canResumeExisting =
        existingMetadata?.projectId === projectId &&
        !!existingMetadata.videoId &&
        existingMetadata?.targetName === trimmedVideoName &&
        (existingMetadata.versionLabel || '') === (trimmedVersionLabel || '')

      let videoId: string
      let createdVideoRecord = false

      if (canResumeExisting) {
        videoId = existingMetadata!.videoId
        storeUploadMetadata(file, {
          videoId,
          projectId,
          versionLabel: trimmedVersionLabel,
          targetName: trimmedVideoName,
        })
      } else {
        const response = await apiPost('/api/videos', {
          projectId,
          versionLabel: trimmedVersionLabel,
          originalFileName: file.name,
          originalFileSize: file.size,
          name: trimmedVideoName,
        })
        videoId = response.videoId
        createdVideoRecord = true

        storeUploadMetadata(file, {
          videoId,
          projectId,
          versionLabel: trimmedVersionLabel,
          targetName: trimmedVideoName,
        })
      }

      setPendingUploads(prev => prev.map(u =>
        u.id === id ? { ...u, videoId } : u
      ))

      // TUS upload
      let lastLoaded = 0
      let lastTime = Date.now()

      const upload = new tus.Upload(file, {
        endpoint: `${window.location.origin}/api/uploads`,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        metadata: {
          filename: file.name,
          filetype: file.type || 'video/mp4',
          videoId,
        },
        chunkSize: 50 * 1024 * 1024,
        storeFingerprintForResuming: true,
        removeFingerprintOnSuccess: true,

        onBeforeRequest: (req) => {
          const xhr = req.getUnderlyingObject()
          const token = getAccessToken()
          if (token) {
            if (xhr?.setRequestHeader) {
              xhr.setRequestHeader('Authorization', `Bearer ${token}`)
            } else {
              req.setHeader('Authorization', `Bearer ${token}`)
            }
          }
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

          setPendingUploads(prev => prev.map(u =>
            u.id === id ? { ...u, progress: percentage, speed: speed || u.speed } : u
          ))
        },

        onSuccess: () => {
          clearFileContext(file)
          clearUploadMetadata(file)
          clearTUSFingerprint(file)
          uploadRefs.current.delete(id)

          setPendingUploads(prev => prev.map(u =>
            u.id === id ? { ...u, status: 'completed', progress: 100 } : u
          ))

          // Notify parent that this upload is complete
          onUploadComplete(trimmedVideoName, videoId)
        },

        onError: async (error) => {
          let errorMessage = 'Upload failed'
          if (error.message) {
            errorMessage = error.message
          }

          if (error.message?.includes('NetworkError') || error.message?.includes('Failed to fetch')) {
            errorMessage = 'Network error. Please check your connection.'
          }

          const statusCode = (error as any)?.originalResponse?.getStatus?.()

          if (canResumeExisting && (statusCode === 404 || statusCode === 410)) {
            clearUploadMetadata(file)
            clearTUSFingerprint(file)
            errorMessage = 'Upload session expired. Please try again.'
          } else if (createdVideoRecord && videoId) {
            try {
              await apiDelete(`/api/videos/${videoId}`)
            } catch {}
            clearUploadMetadata(file)
            clearTUSFingerprint(file)
          }

          uploadRefs.current.delete(id)
          setPendingUploads(prev => prev.map(u =>
            u.id === id ? { ...u, status: 'error', error: errorMessage } : u
          ))
        },
      })

      const previousUploads = await upload.findPreviousUploads()
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0])
      }

      uploadRefs.current.set(id, upload)
      upload.start()

    } catch (error) {
      setPendingUploads(prev => prev.map(u =>
        u.id === id ? { ...u, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' } : u
      ))
    }
  }

  const handlePauseResume = (id: string) => {
    const upload = uploadRefs.current.get(id)
    if (!upload) return

    const item = pendingUploads.find(u => u.id === id)
    if (!item) return

    if (item.paused) {
      upload.start()
      setPendingUploads(prev => prev.map(u =>
        u.id === id ? { ...u, paused: false } : u
      ))
    } else {
      upload.abort()
      setPendingUploads(prev => prev.map(u =>
        u.id === id ? { ...u, paused: true } : u
      ))
    }
  }

  const handleStartAll = () => {
    const pendingItems = pendingUploads.filter(u => u.status === 'pending' && u.videoName.trim())
    pendingItems.forEach(item => startUpload(item))
  }

  const handleRetry = (id: string) => {
    const item = pendingUploads.find(u => u.id === id)
    if (item) {
      startUpload(item)
    }
  }

  const handleClose = () => {
    // Only allow close if no uploads are in progress
    const hasActiveUploads = pendingUploads.some(u => u.status === 'uploading')
    if (hasActiveUploads) return

    // Clean up completed uploads from the list
    setPendingUploads([])
    onClose()
  }

  const hasActiveUploads = pendingUploads.some(u => u.status === 'uploading')
  const hasPendingItems = pendingUploads.some(u => u.status === 'pending' && u.videoName.trim())
  const allCompleted = pendingUploads.length > 0 && pendingUploads.every(u => u.status === 'completed')

  // Warn before closing browser if uploads are active
  useEffect(() => {
    if (hasActiveUploads) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault()
        e.returnValue = ''
        return ''
      }
      window.addEventListener('beforeunload', handleBeforeUnload)
      return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [hasActiveUploads])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg overflow-hidden" onPointerDownOutside={(e) => hasActiveUploads && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Upload Videos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Drop zone - only show when no active uploads */}
          {!hasActiveUploads && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 transition-all cursor-pointer text-center',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-accent/30'
              )}
            >
              <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {isDragging ? 'Drop videos here' : 'Drop videos here or click to browse'}
              </p>
            </div>
          )}

          {/* Uploads list */}
          {pendingUploads.length > 0 && (
            <div className="space-y-3 max-h-[400px] overflow-y-auto overflow-x-hidden">
              {pendingUploads.map((upload) => (
                <div key={upload.id} className="border rounded-lg p-3 bg-card overflow-hidden">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="shrink-0 mt-1">
                      {upload.status === 'completed' ? (
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      ) : (
                        <Video className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Video name input */}
                      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                        <Input
                          value={upload.videoName}
                          onChange={(e) => handleUpdateName(upload.id, e.target.value)}
                          placeholder="Video name"
                          className="h-9 flex-1 min-w-0"
                          disabled={upload.status !== 'pending'}
                          maxLength={MAX_VIDEO_NAME_LENGTH}
                        />
                        {upload.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemove(upload.id)}
                            className="h-9 w-9 shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      {/* Version label input */}
                      {upload.status === 'pending' && (
                        <Input
                          value={upload.versionLabel}
                          onChange={(e) => handleUpdateVersionLabel(upload.id, e.target.value)}
                          placeholder="Version label (optional, e.g. v1, Draft 1)"
                          className="h-8 text-sm w-full min-w-0"
                        />
                      )}

                      {/* File info */}
                      <div className="text-xs text-muted-foreground">
                        <span title={upload.file.name}>{truncateFilename(upload.file.name, MAX_FILENAME_DISPLAY_LENGTH)}</span>
                        <span> ({formatFileSize(upload.file.size)})</span>
                      </div>

                      {/* Progress bar */}
                      {(upload.status === 'uploading' || upload.status === 'completed') && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              {upload.paused ? 'Paused' : upload.status === 'completed' ? 'Completed' : 'Uploading...'}
                            </span>
                            <span className="font-medium">{upload.progress}%</span>
                          </div>
                          <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className={cn(
                                "h-full transition-all",
                                upload.status === 'completed' ? 'bg-success' : upload.paused ? 'bg-warning' : 'bg-primary'
                              )}
                              style={{ width: `${upload.progress}%` }}
                            />
                          </div>
                          {upload.speed > 0 && upload.status === 'uploading' && !upload.paused && (
                            <p className="text-xs text-muted-foreground">
                              Speed: {upload.speed} MB/s
                            </p>
                          )}
                        </div>
                      )}

                      {/* Upload controls */}
                      {upload.status === 'uploading' && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePauseResume(upload.id)}
                            className="flex-1 h-8"
                          >
                            {upload.paused ? (
                              <>
                                <Play className="w-3 h-3 mr-1" />
                                Resume
                              </>
                            ) : (
                              <>
                                <Pause className="w-3 h-3 mr-1" />
                                Pause
                              </>
                            )}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRemove(upload.id)}
                            className="h-8"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      )}

                      {/* Error state */}
                      {upload.status === 'error' && (
                        <div className="space-y-2">
                          <p className="text-xs text-destructive break-words">{upload.error}</p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetry(upload.id)}
                              className="h-8"
                            >
                              Retry
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemove(upload.id)}
                              className="h-8"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add more button */}
          {pendingUploads.length > 0 && !hasActiveUploads && !allCompleted && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add More Videos
            </Button>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={hasActiveUploads}
            >
              {allCompleted ? 'Done' : 'Cancel'}
            </Button>
            {hasPendingItems && !hasActiveUploads && (
              <Button onClick={handleStartAll}>
                <Upload className="w-4 h-4 mr-2" />
                Start Upload{pendingUploads.filter(u => u.status === 'pending').length > 1 ? 's' : ''}
              </Button>
            )}
          </div>

          {/* Help text */}
          {!hasActiveUploads && !allCompleted && (
            <p className="text-xs text-muted-foreground text-center">
              Leave version label empty to auto-generate (v1, v2, v3...)
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
