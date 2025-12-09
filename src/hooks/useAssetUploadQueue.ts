import { useState, useRef, useCallback, useEffect } from 'react'
import * as tus from 'tus-js-client'
import { apiPost, apiDelete } from '@/lib/api-client'
import { getAccessToken } from '@/lib/token-store'
import {
  ensureFreshUploadOnContextChange,
  clearFileContext,
  getUploadMetadata,
  storeUploadMetadata,
  clearUploadMetadata,
  clearTUSFingerprint,
} from '@/lib/tus-context'

export interface QueuedUpload {
  id: string
  file: File
  category: string
  assetId: string | null
  videoId: string

  // Status tracking
  status: 'queued' | 'uploading' | 'paused' | 'completed' | 'error'
  progress: number
  uploadSpeed: number
  error: string | null

  // TUS upload reference
  tusUpload: tus.Upload | null

  // Timestamps
  createdAt: number
  startedAt: number | null
  completedAt: number | null
}

interface UseAssetUploadQueueOptions {
  videoId: string
  maxConcurrent?: number
  onUploadComplete?: () => void
}

export function useAssetUploadQueue({
  videoId,
  maxConcurrent = 3,
  onUploadComplete
}: UseAssetUploadQueueOptions) {
  const [queue, setQueue] = useState<QueuedUpload[]>([])
  const uploadRefsMap = useRef<Map<string, tus.Upload>>(new Map())
  const assetIdsMap = useRef<Map<string, string>>(new Map())
  const queueRef = useRef(queue)

  // Keep queueRef in sync with queue state
  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  // Add file to queue
  const addToQueue = useCallback((file: File, category: string): string => {
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const newUpload: QueuedUpload = {
      id: uploadId,
      file,
      category,
      assetId: null,
      videoId,
      status: 'queued',
      progress: 0,
      uploadSpeed: 0,
      error: null,
      tusUpload: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
    }

    setQueue(prev => [...prev, newUpload])

    return uploadId
  }, [videoId])

  // Auto-start queued uploads when slots are available
  useEffect(() => {
    const currentUploading = queue.filter(u => u.status === 'uploading').length
    const queuedUploads = queue.filter(u => u.status === 'queued')

    // Start queued uploads if we have available slots
    if (currentUploading < maxConcurrent && queuedUploads.length > 0) {
      const slotsAvailable = maxConcurrent - currentUploading
      const uploadsToStart = queuedUploads.slice(0, slotsAvailable)

      uploadsToStart.forEach(upload => {
        startUpload(upload.id)
      })
    }
  }, [queue, maxConcurrent])

  // Warn before leaving page if uploads are in progress
  useEffect(() => {
    const hasActiveUploads = queue.some(u =>
      u.status === 'uploading' || u.status === 'queued' || u.status === 'paused'
    )

    if (hasActiveUploads) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault()
        e.returnValue = '' // Chrome requires returnValue to be set
        return '' // Some browsers use the return value
      }

      window.addEventListener('beforeunload', handleBeforeUnload)

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
    }
  }, [queue])

  // Start an upload
  const startUpload = useCallback(async (uploadId: string) => {
    const upload = queueRef.current.find(u => u.id === uploadId)
    if (!upload || upload.status === 'uploading') return

    try {
      // Check if file was uploaded to different video and clear TUS fingerprint if needed
      ensureFreshUploadOnContextChange(upload.file, `${videoId}:${upload.category || 'default'}`)

      const existingMetadata = getUploadMetadata(upload.file)
      const canResumeExisting =
        existingMetadata?.videoId === videoId &&
        !!existingMetadata.assetId &&
        (existingMetadata.category || null) === (upload.category || null)
      let createdAssetRecord = false

      // Update status to uploading
      setQueue(prev => prev.map(u =>
        u.id === uploadId
          ? { ...u, status: 'uploading' as const, startedAt: Date.now(), error: null }
          : u
      ))

      // Create asset record if we don't have one stored
      let assetId: string
      if (canResumeExisting) {
        assetId = existingMetadata!.assetId!
        assetIdsMap.current.set(uploadId, assetId)
        storeUploadMetadata(upload.file, {
          videoId,
          assetId,
          category: upload.category,
        })
      } else {
        const response = await apiPost(`/api/videos/${videoId}/assets`, {
          fileName: upload.file.name,
          fileSize: upload.file.size,
          category: upload.category || null,
        })

        assetId = response.assetId
        assetIdsMap.current.set(uploadId, assetId)
        createdAssetRecord = true

        storeUploadMetadata(upload.file, {
          videoId,
          assetId,
          category: upload.category,
        })
      }

      // Start TUS upload
      const startTime = Date.now()
      let lastLoaded = 0
      let lastTime = startTime

      const tusUpload = new tus.Upload(upload.file, {
        endpoint: `${window.location.origin}/api/uploads`,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        metadata: {
          filename: upload.file.name,
          filetype: upload.file.type || 'application/octet-stream',
          assetId: assetId,
        },
        chunkSize: 50 * 1024 * 1024,
        storeFingerprintForResuming: true,
        removeFingerprintOnSuccess: true,

        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = Math.round((bytesUploaded / bytesTotal) * 100)

          // Calculate upload speed
          const now = Date.now()
          const timeDiff = (now - lastTime) / 1000
          const bytesDiff = bytesUploaded - lastLoaded

          let speedMBps = 0
          if (timeDiff > 0.5) {
            speedMBps = (bytesDiff / timeDiff) / (1024 * 1024)
            lastLoaded = bytesUploaded
            lastTime = now
          }

          setQueue(prev => prev.map(u =>
            u.id === uploadId
              ? {
                  ...u,
                  progress: percentage,
                  // Keep last stable speed to avoid flicker between 0 and a value
                  uploadSpeed:
                    speedMBps > 0.05
                      ? Math.round(speedMBps * 10) / 10
                      : u.uploadSpeed
                }
              : u
          ))
        },

        onSuccess: () => {
          setQueue(prev => prev.map(u =>
            u.id === uploadId
              ? { ...u, status: 'completed' as const, progress: 100, completedAt: Date.now() }
              : u
          ))

          uploadRefsMap.current.delete(uploadId)
          assetIdsMap.current.delete(uploadId)

          // Clear file context since upload completed
          clearFileContext(upload.file)
          clearUploadMetadata(upload.file)
          clearTUSFingerprint(upload.file)

          if (onUploadComplete) {
            onUploadComplete()
          }

          // useEffect will auto-start next queued upload
        },

        onError: async (error) => {
          let errorMessage = 'Upload failed'

          if (error.message?.includes('NetworkError') || error.message?.includes('Failed to fetch')) {
            errorMessage = 'Network error. Please check your connection and try again.'
          } else if (error.message?.includes('413')) {
            errorMessage = 'File is too large. Please choose a smaller file.'
          } else if (error.message?.includes('401') || error.message?.includes('403')) {
            errorMessage = 'Authentication failed. Please log in again.'
          } else if (error.message?.includes('404')) {
            errorMessage = 'Upload endpoint not found. Check server logs.'
          } else if (error.message?.includes('500')) {
            errorMessage = 'Server error. Check server logs for details.'
          } else if (error.message) {
            errorMessage = error.message
          }

          const statusCode = (error as any)?.originalResponse?.getStatus?.()

          // Clean up asset record on error
          const currentAssetId = assetIdsMap.current.get(uploadId)
          if (currentAssetId) {
            // If resume session is gone, clear local resume data and keep the DB record (user can retry fresh)
            if (canResumeExisting && (statusCode === 404 || statusCode === 410)) {
              clearUploadMetadata(upload.file)
              clearTUSFingerprint(upload.file)
              errorMessage = 'Upload session expired. Please restart the upload.'
            } else if (createdAssetRecord) {
              try {
                await apiDelete(`/api/videos/${videoId}/assets/${currentAssetId}`)
              } catch {}
              clearUploadMetadata(upload.file)
              clearTUSFingerprint(upload.file)
            }
            assetIdsMap.current.delete(uploadId)
          }

          setQueue(prev => prev.map(u =>
            u.id === uploadId
              ? { ...u, status: 'error' as const, error: errorMessage }
              : u
          ))

          uploadRefsMap.current.delete(uploadId)
        },

        onBeforeRequest: (req) => {
          const xhr = req.getUnderlyingObject()
          xhr.withCredentials = true

          // Add authorization token for admin uploads
          const token = getAccessToken()
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`)
          }
        },
      })

      const previousUploads = await tusUpload.findPreviousUploads()
      if (previousUploads.length > 0) {
        tusUpload.resumeFromPreviousUpload(previousUploads[0])
      } else if (!createdAssetRecord && canResumeExisting) {
        // We expected to resume but no session exists; clear stale metadata so next attempt starts fresh
        clearUploadMetadata(upload.file)
        clearTUSFingerprint(upload.file)
      }

      uploadRefsMap.current.set(uploadId, tusUpload)
      tusUpload.start()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed'
      setQueue(prev => prev.map(u =>
        u.id === uploadId
          ? { ...u, status: 'error' as const, error: errorMessage }
          : u
      ))
    }
  }, [queue, videoId, onUploadComplete])

  // Pause an upload
  const pauseUpload = useCallback((uploadId: string) => {
    const tusUpload = uploadRefsMap.current.get(uploadId)
    if (tusUpload) {
      tusUpload.abort()
      setQueue(prev => prev.map(u =>
        u.id === uploadId ? { ...u, status: 'paused' as const } : u
      ))
    }
  }, [])

  // Resume an upload
  const resumeUpload = useCallback((uploadId: string) => {
    const tusUpload = uploadRefsMap.current.get(uploadId)
    if (tusUpload) {
      tusUpload.start()
      setQueue(prev => prev.map(u =>
        u.id === uploadId ? { ...u, status: 'uploading' as const } : u
      ))
    }
  }, [])

  // Cancel an upload
  const cancelUpload = useCallback(async (uploadId: string) => {
    const tusUpload = uploadRefsMap.current.get(uploadId)
    if (tusUpload) {
      tusUpload.abort(true)
    }

    // Clean up asset record
    const assetId = assetIdsMap.current.get(uploadId)
    if (assetId) {
      try {
        await apiDelete(`/api/videos/${videoId}/assets/${assetId}`)
      } catch {}
    }

    uploadRefsMap.current.delete(uploadId)
    assetIdsMap.current.delete(uploadId)

    // Remove from queue
    setQueue(prev => prev.filter(u => u.id !== uploadId))

    const upload = queueRef.current.find(u => u.id === uploadId)
    if (upload) {
      clearUploadMetadata(upload.file)
      clearTUSFingerprint(upload.file)
      clearFileContext(upload.file)
    }

    // useEffect will auto-start next queued upload
  }, [videoId])

  // Remove completed upload from queue
  const removeCompleted = useCallback((uploadId: string) => {
    setQueue(prev => prev.filter(u => u.id !== uploadId))
  }, [])

  // Clear all completed uploads
  const clearCompleted = useCallback(() => {
    setQueue(prev => prev.filter(u => u.status !== 'completed'))
  }, [])

  // Retry failed upload
  const retryUpload = useCallback((uploadId: string) => {
    setQueue(prev => prev.map(u =>
      u.id === uploadId
        ? { ...u, status: 'queued' as const, error: null, progress: 0, uploadSpeed: 0 }
        : u
    ))

    setTimeout(() => {
      startUpload(uploadId)
    }, 100)
  }, [startUpload])

  // Get queue statistics
  const stats = {
    total: queue.length,
    queued: queue.filter(u => u.status === 'queued').length,
    uploading: queue.filter(u => u.status === 'uploading').length,
    paused: queue.filter(u => u.status === 'paused').length,
    completed: queue.filter(u => u.status === 'completed').length,
    error: queue.filter(u => u.status === 'error').length,
  }

  return {
    queue,
    stats,
    addToQueue,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    removeCompleted,
    clearCompleted,
    retryUpload,
  }
}
