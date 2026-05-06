'use client'

import { useRef, useCallback } from 'react'
import { apiPost } from '@/lib/api-client'
import { getAccessToken } from '@/lib/token-store'

// Upload N parts in parallel via a shared worker pool. Each finished part
// frees its slot for the next queued part — no straggler-blocks-batch waste.
const PARALLEL_PARTS = 4
// Minimum part size required by S3 spec (5 MiB), except for the last part
const MIN_PART_SIZE = 5 * 1024 * 1024
// Per-part retry: handles transient 5xx from MinIO/R2/etc. without aborting
// the whole upload. Backoff: 0.5s → 1.5s → 4.5s.
const PART_MAX_ATTEMPTS = 3
const PART_RETRY_BASE_MS = 500

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

        // ── 2. Upload parts directly to S3 ────────────────────────────────────
        const { uploadId, partSize: serverPartSize, parts } = presignRes
        if (!serverPartSize || serverPartSize < MIN_PART_SIZE) {
          throw new Error(`Server returned invalid partSize: ${serverPartSize}`)
        }
        const partSize = serverPartSize
        const completedParts: Array<{ partNumber: number; etag: string }> = []

        // Per-part progress tracking. `partProgress[partNumber-1]` holds bytes
        // sent for that part. Sum + clamp gives smooth byte-level progress
        // even though parts upload in parallel.
        const partProgress = new Array<number>(parts.length).fill(0)
        const reportProgress = () => {
          let sum = 0
          for (const v of partProgress) sum += v
          onProgress?.(Math.min(sum, file.size), file.size)
        }

        async function waitIfPaused(): Promise<void> {
          const gate = pauseGatesRef.current.get(uploadKey)
          if (gate) await gate.promise
        }

        function uploadPartWithProgress(
          url: string,
          chunk: Blob,
          partIndex: number
        ): Promise<string> {
          return new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            // Tear down on external abort
            const onAbort = () => xhr.abort()
            signal.addEventListener('abort', onAbort, { once: true })

            xhr.open('PUT', url, true)
            xhr.upload.onprogress = (ev) => {
              if (ev.lengthComputable) {
                partProgress[partIndex] = ev.loaded
                reportProgress()
              }
            }
            xhr.onload = () => {
              signal.removeEventListener('abort', onAbort)
              if (xhr.status >= 200 && xhr.status < 300) {
                const etag =
                  xhr.getResponseHeader('ETag') ?? xhr.getResponseHeader('etag')
                if (!etag) {
                  reject(new Error(`Part ${partIndex + 1} returned no ETag`))
                  return
                }
                // On success, lock the part's progress at its full size so
                // partial-byte XHR reporting can't drift the total.
                partProgress[partIndex] = chunk.size
                reportProgress()
                resolve(etag.replace(/"/g, ''))
              } else {
                reject(new Error(`Part ${partIndex + 1} HTTP ${xhr.status}`))
              }
            }
            xhr.onerror = () => {
              signal.removeEventListener('abort', onAbort)
              reject(new Error(`Part ${partIndex + 1} network error`))
            }
            xhr.onabort = () => {
              signal.removeEventListener('abort', onAbort)
              reject(new Error('Upload cancelled'))
            }
            xhr.ontimeout = () => {
              signal.removeEventListener('abort', onAbort)
              reject(new Error(`Part ${partIndex + 1} timeout`))
            }
            xhr.send(chunk)
          })
        }

        async function uploadOnePart(partNumber: number, url: string): Promise<void> {
          const partIndex = partNumber - 1
          const start = partIndex * partSize
          const end = Math.min(start + partSize, file.size)
          const chunk = file.slice(start, end)

          let lastErr: unknown = null
          for (let attempt = 1; attempt <= PART_MAX_ATTEMPTS; attempt++) {
            if (signal.aborted) throw new Error('Upload cancelled')
            await waitIfPaused()
            if (signal.aborted) throw new Error('Upload cancelled')

            try {
              // Reset progress at start of each attempt so the bar doesn't
              // double-count bytes from a failed attempt.
              partProgress[partIndex] = 0
              reportProgress()

              const etag = await uploadPartWithProgress(url, chunk, partIndex)
              completedParts.push({ partNumber, etag })
              return
            } catch (err: any) {
              lastErr = err
              if (signal.aborted) throw err
              if (err?.message === 'Upload cancelled') throw err
              if (attempt < PART_MAX_ATTEMPTS) {
                const backoff = PART_RETRY_BASE_MS * Math.pow(3, attempt - 1)
                await new Promise((r) => setTimeout(r, backoff))
              }
            }
          }
          throw lastErr instanceof Error ? lastErr : new Error(`Part ${partNumber} failed`)
        }

        // Worker pool: N concurrent workers pull from a shared FIFO queue.
        // A slow part no longer idles the other workers — they keep dequeuing.
        const queue = [...parts]
        async function workerLoop(): Promise<void> {
          while (queue.length > 0) {
            const part = queue.shift()
            if (!part) return
            await uploadOnePart(part.partNumber, part.url)
          }
        }

        const workers = Array.from(
          { length: Math.min(PARALLEL_PARTS, parts.length) },
          () => workerLoop()
        )
        await Promise.all(workers)

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
