'use client'

import { useRef, useCallback } from 'react'
import { apiPost } from '@/lib/api-client'
import { getAccessToken } from '@/lib/token-store'

// Upload 4 parts in parallel for throughput without exhausting connections
const PARALLEL_PARTS = 4
// Minimum part size required by S3 spec (5 MiB), except for the last part
const MIN_PART_SIZE = 5 * 1024 * 1024

interface PresignResponse {
  uploadId: string
  partSize: number
  parts: Array<{ partNumber: number; url: string }>
}

export interface S3UploadTarget {
  videoId?: string
  assetId?: string
  projectUploadId?: string
  /** Explicit bearer token — set for share-token-authenticated uploads */
  bearerToken?: string
}

export interface S3UploadCallbacks {
  onProgress?: (bytesUploaded: number, bytesTotal: number) => void
  onSuccess?: () => void
  onError?: (error: Error) => void
}

interface ActiveUpload {
  abortController: AbortController
  uploadId: string
  target: S3UploadTarget
  bearerToken: string | null
}

interface PauseGate {
  promise: Promise<void>
  resolve: () => void
}

/**
 * Hook that manages direct browser-to-S3 multipart uploads.
 *
 * Usage:
 *   const { startUpload, abortUpload, pauseUpload, resumeUpload } = useS3MultipartUpload()
 *   await startUpload(file, { videoId }, { onProgress, onSuccess, onError })
 */
export function useS3MultipartUpload() {
  const activeUploadsRef = useRef<Map<string, ActiveUpload>>(new Map())
  const pauseGatesRef = useRef<Map<string, PauseGate>>(new Map())

  const startUpload = useCallback(
    async (
      file: File,
      target: S3UploadTarget,
      callbacks: S3UploadCallbacks = {},
      uploadKey: string = crypto.randomUUID()
    ): Promise<void> => {
      const { onProgress, onSuccess, onError } = callbacks
      const abortController = new AbortController()
      const { signal } = abortController

      try {
        // ── 1. Request presigned part URLs ─────────────────────────────────────
        // Prefer explicit bearer token (share pages), fallback to admin token from store
        const bearerToken = target.bearerToken ?? getAccessToken()
        const authInit: RequestInit = bearerToken
          ? { headers: { Authorization: `Bearer ${bearerToken}` } }
          : {}

        const presignRes: PresignResponse = await apiPost(
          '/api/uploads/s3/presign',
          {
            videoId: target.videoId,
            assetId: target.assetId,
            projectUploadId: target.projectUploadId,
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            fileSize: file.size,
          },
          authInit
        )

        if (signal.aborted) return

        activeUploadsRef.current.set(uploadKey, {
          abortController,
          uploadId: presignRes.uploadId,
          target,
          bearerToken: bearerToken ?? null,
        })

        // ── 2. Upload parts directly to MinIO ─────────────────────────────────
        const { uploadId, partSize: serverPartSize, parts } = presignRes
        if (!serverPartSize || serverPartSize < MIN_PART_SIZE) {
          throw new Error(`Server returned invalid partSize: ${serverPartSize}`)
        }
        const partSize = serverPartSize
        const totalParts = parts.length
        const completedParts: Array<{ partNumber: number; etag: string }> = []
        let bytesUploaded = 0

        // Process parts in batches of PARALLEL_PARTS
        for (let i = 0; i < totalParts; i += PARALLEL_PARTS) {
          if (signal.aborted) {
            await abortUpload(uploadKey)
            throw new Error('Upload cancelled')
          }

          // ── Pause gate: block here while paused ───────────────────────────
          const gate = pauseGatesRef.current.get(uploadKey)
          if (gate) {
            await gate.promise
            // Re-check abort after resume
            if (signal.aborted) {
              await abortUpload(uploadKey)
              throw new Error('Upload cancelled')
            }
          }

          const batch = parts.slice(i, i + PARALLEL_PARTS)

          const batchResults = await Promise.all(
            batch.map(async ({ partNumber, url }) => {
              const start = (partNumber - 1) * partSize
              const end = Math.min(start + partSize, file.size)
              const chunk = file.slice(start, end)

              const response = await fetch(url, {
                method: 'PUT',
                body: chunk,
                signal,
              })

              if (!response.ok) {
                throw new Error(`Part ${partNumber} upload failed: HTTP ${response.status}`)
              }

              const etag = response.headers.get('ETag') || response.headers.get('etag')
              if (!etag) throw new Error(`Part ${partNumber} returned no ETag`)

              bytesUploaded += chunk.size
              onProgress?.(Math.min(bytesUploaded, file.size), file.size)

              return { partNumber, etag: etag.replace(/"/g, '') }
            })
          )

          completedParts.push(...batchResults)
        }

        if (signal.aborted) return

        // ── 3. Complete the multipart upload ───────────────────────────────────
        await apiPost(
          '/api/uploads/s3/complete',
          {
            uploadId,
            videoId: target.videoId,
            assetId: target.assetId,
            projectUploadId: target.projectUploadId,
            parts: completedParts,
            fileSize: file.size,
            contentType: file.type || 'application/octet-stream',
          },
          authInit
        )

        activeUploadsRef.current.delete(uploadKey)
        pauseGatesRef.current.delete(uploadKey)
        onSuccess?.()
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const isCancelled = (err as Error).message === 'Upload cancelled' || signal.aborted

        console.warn('[S3 MULTIPART] Upload failed:', isCancelled ? 'cancelled' : errorMessage)

        // On any non-success path, best-effort abort multipart upload to avoid orphaned parts.
        if (activeUploadsRef.current.has(uploadKey)) {
          console.warn('[S3 MULTIPART] Attempting multipart abort cleanup')
          await abortUpload(uploadKey)
        }

        if (isCancelled) return
        onError?.(err instanceof Error ? err : new Error(String(err)))
      }
    },
    [abortUpload]
  )

  const abortUpload = useCallback(async (uploadKey: string): Promise<void> => {
    const active = activeUploadsRef.current.get(uploadKey)
    if (!active) return

    active.abortController.abort()
    activeUploadsRef.current.delete(uploadKey)

    // If paused, resolve the gate so the loop can exit
    const gate = pauseGatesRef.current.get(uploadKey)
    if (gate) {
      gate.resolve()
      pauseGatesRef.current.delete(uploadKey)
    }

    // Best-effort abort on S3 to free incomplete multipart storage
    try {
      const authHeader = active.bearerToken
        ? { headers: { Authorization: `Bearer ${active.bearerToken}` } }
        : getAccessToken()
        ? { headers: { Authorization: `Bearer ${getAccessToken()}` } }
        : {}
      await apiPost(
        '/api/uploads/s3/abort',
        {
          uploadId: active.uploadId,
          videoId: active.target.videoId,
          assetId: active.target.assetId,
          projectUploadId: active.target.projectUploadId,
        },
        authHeader
      )
    } catch (err) {
      console.warn('[S3 MULTIPART] Failed to abort multipart upload:', err)
    }
  }, [])

  /** Pause an in-progress upload. Takes effect between part batches. */
  const pauseUpload = useCallback((uploadKey: string): void => {
    if (pauseGatesRef.current.has(uploadKey)) return
    let resolve: () => void
    const promise = new Promise<void>((r) => { resolve = r })
    pauseGatesRef.current.set(uploadKey, { promise, resolve: resolve! })
  }, [])

  /** Resume a paused upload. */
  const resumeUpload = useCallback((uploadKey: string): void => {
    const gate = pauseGatesRef.current.get(uploadKey)
    if (gate) {
      gate.resolve()
      pauseGatesRef.current.delete(uploadKey)
    }
  }, [])

  return { startUpload, abortUpload, pauseUpload, resumeUpload }
}
