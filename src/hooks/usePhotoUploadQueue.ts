import { useState, useRef, useCallback, useEffect } from 'react'
import * as tus from 'tus-js-client'
import { apiPost, apiDelete } from '@/lib/api-client'
import { getAccessToken } from '@/lib/token-store'
import { getTusUploadErrorMessage, createTusAfterResponseHandler, createTusShouldRetryHandler, resetTusAuthRetry } from '@/lib/tus-error'
import { getTusChunkSizeBytes, TUS_RETRY_DELAYS_MS } from '@/lib/transfer-tuning'
import { useS3MultipartUpload } from '@/hooks/useS3MultipartUpload'
import { useStorageProvider } from '@/components/StorageConfigProvider'

export interface QueuedPhotoUpload {
  id: string
  file: File
  photoId: string | null
  albumId: string

  status: 'queued' | 'uploading' | 'completed' | 'error'
  progress: number
  error: string | null

  createdAt: number
}

interface UsePhotoUploadQueueOptions {
  projectId: string
  albumId: string
  maxConcurrent?: number
  onUploadComplete?: () => void
}

/**
 * Upload queue for album photos (admin only). Simplified version of
 * useAssetUploadQueue — photos are small, so no pause/resume bookkeeping.
 */
export function usePhotoUploadQueue({
  projectId,
  albumId,
  maxConcurrent = 3,
  onUploadComplete
}: UsePhotoUploadQueueOptions) {
  const [queue, setQueue] = useState<QueuedPhotoUpload[]>([])
  const photoIdsMap = useRef<Map<string, string>>(new Map())
  const uploadRefsMap = useRef<Map<string, tus.Upload>>(new Map())
  const s3AbortKeysMap = useRef<Map<string, string>>(new Map())
  const queueRef = useRef(queue)
  const { startUpload: startS3Upload, abortUpload: abortS3Upload } = useS3MultipartUpload()
  const storageProvider = useStorageProvider()

  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  const addToQueue = useCallback((file: File, targetAlbumId?: string): string => {
    const uploadId = `photo-upload-${crypto.randomUUID()}`

    setQueue(prev => [...prev, {
      id: uploadId,
      file,
      photoId: null,
      albumId: targetAlbumId || albumId,
      status: 'queued',
      progress: 0,
      error: null,
      createdAt: Date.now(),
    }])

    return uploadId
  }, [albumId])

  useEffect(() => {
    const hasActiveUploads = queue.some(u => u.status === 'uploading' || u.status === 'queued')

    if (hasActiveUploads) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault()
        e.returnValue = ''
        return ''
      }

      window.addEventListener('beforeunload', handleBeforeUnload)
      return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [queue])

  const startUpload = useCallback(async (uploadId: string) => {
    const upload = queueRef.current.find(u => u.id === uploadId)
    if (!upload || upload.status === 'uploading') return

    try {
      setQueue(prev => prev.map(u =>
        u.id === uploadId ? { ...u, status: 'uploading' as const, error: null } : u
      ))

      const targetAlbumId = upload.albumId
      const response = await apiPost(`/api/projects/${projectId}/photo-albums/${targetAlbumId}/photos`, {
        fileName: upload.file.name,
        fileSize: upload.file.size,
        mimeType: upload.file.type || 'application/octet-stream',
      })

      const photoId: string = response.photoId
      photoIdsMap.current.set(uploadId, photoId)

      const deletePhotoRecord = async () => {
        try {
          await apiDelete(`/api/projects/${projectId}/photo-albums/${targetAlbumId}/photos/${photoId}`)
        } catch {}
      }

      if (storageProvider === 's3') {
        const s3Key = `s3-photo-${uploadId}`
        s3AbortKeysMap.current.set(uploadId, s3Key)

        await startS3Upload(
          upload.file,
          { photoId },
          {
            onProgress: (bytesUploaded, bytesTotal) => {
              const percentage = Math.round((bytesUploaded / bytesTotal) * 100)
              setQueue(prev => prev.map(u =>
                u.id === uploadId ? { ...u, progress: percentage } : u
              ))
            },
            onSuccess: () => {
              setQueue(prev => prev.map(u =>
                u.id === uploadId
                  ? { ...u, status: 'completed' as const, progress: 100, photoId }
                  : u
              ))
              s3AbortKeysMap.current.delete(uploadId)
              photoIdsMap.current.delete(uploadId)
              onUploadComplete?.()
            },
            onError: async (err) => {
              await deletePhotoRecord()
              setQueue(prev => prev.map(u =>
                u.id === uploadId ? { ...u, status: 'error' as const, error: err.message } : u
              ))
              s3AbortKeysMap.current.delete(uploadId)
              photoIdsMap.current.delete(uploadId)
            },
          },
          s3Key
        )
      } else {
        const tusRef: { current: tus.Upload | null } = { current: null }

        const tusUpload = new tus.Upload(upload.file, {
          endpoint: `${window.location.origin}/api/uploads`,
          retryDelays: TUS_RETRY_DELAYS_MS,
          metadata: {
            filename: upload.file.name,
            filetype: upload.file.type || 'application/octet-stream',
            photoId,
          },
          chunkSize: getTusChunkSizeBytes(upload.file.size),
          storeFingerprintForResuming: false,

          onAfterResponse: createTusAfterResponseHandler(tusRef),
          onShouldRetry: createTusShouldRetryHandler(tusRef),

          onProgress: (bytesUploaded, bytesTotal) => {
            const percentage = Math.round((bytesUploaded / bytesTotal) * 100)
            setQueue(prev => prev.map(u =>
              u.id === uploadId ? { ...u, progress: percentage } : u
            ))
          },

          onSuccess: () => {
            resetTusAuthRetry(tusRef.current)
            setQueue(prev => prev.map(u =>
              u.id === uploadId
                ? { ...u, status: 'completed' as const, progress: 100, photoId }
                : u
            ))
            uploadRefsMap.current.delete(uploadId)
            photoIdsMap.current.delete(uploadId)
            onUploadComplete?.()
          },

          onError: async (error) => {
            const errorMessage = getTusUploadErrorMessage(error)
            await deletePhotoRecord()
            setQueue(prev => prev.map(u =>
              u.id === uploadId ? { ...u, status: 'error' as const, error: errorMessage } : u
            ))
            resetTusAuthRetry(tusRef.current)
            uploadRefsMap.current.delete(uploadId)
            photoIdsMap.current.delete(uploadId)
          },

          onBeforeRequest: (req) => {
            const xhr = req.getUnderlyingObject()
            xhr.withCredentials = true

            const token = getAccessToken()
            if (token) {
              xhr.setRequestHeader('Authorization', `Bearer ${token}`)
            }
          },
        })

        tusRef.current = tusUpload
        uploadRefsMap.current.set(uploadId, tusUpload)
        tusUpload.start()
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed'
      setQueue(prev => prev.map(u =>
        u.id === uploadId ? { ...u, status: 'error' as const, error: errorMessage } : u
      ))
    }
  }, [projectId, onUploadComplete, storageProvider, startS3Upload])

  useEffect(() => {
    const currentUploading = queue.filter(u => u.status === 'uploading').length
    const queuedUploads = queue.filter(u => u.status === 'queued')

    if (currentUploading < maxConcurrent && queuedUploads.length > 0) {
      queuedUploads.slice(0, maxConcurrent - currentUploading).forEach(upload => {
        startUpload(upload.id)
      })
    }
  }, [queue, maxConcurrent, startUpload])

  const cancelUpload = useCallback(async (uploadId: string) => {
    if (storageProvider === 's3') {
      const s3Key = s3AbortKeysMap.current.get(uploadId)
      if (s3Key) {
        await abortS3Upload(s3Key)
        s3AbortKeysMap.current.delete(uploadId)
      }
    } else {
      const tusUpload = uploadRefsMap.current.get(uploadId)
      if (tusUpload) {
        tusUpload.abort(true)
      }
      uploadRefsMap.current.delete(uploadId)
    }

    const photoId = photoIdsMap.current.get(uploadId)
    const item = queueRef.current.find(u => u.id === uploadId)
    if (photoId && item) {
      try {
        await apiDelete(`/api/projects/${projectId}/photo-albums/${item.albumId}/photos/${photoId}`)
      } catch {}
    }
    photoIdsMap.current.delete(uploadId)

    setQueue(prev => prev.filter(u => u.id !== uploadId))
  }, [projectId, abortS3Upload, storageProvider])

  const clearFinished = useCallback(() => {
    setQueue(prev => prev.filter(u => u.status === 'queued' || u.status === 'uploading'))
  }, [])

  const stats = {
    total: queue.length,
    queued: queue.filter(u => u.status === 'queued').length,
    uploading: queue.filter(u => u.status === 'uploading').length,
    completed: queue.filter(u => u.status === 'completed').length,
    error: queue.filter(u => u.status === 'error').length,
  }

  return {
    queue,
    stats,
    addToQueue,
    cancelUpload,
    clearFinished,
  }
}
