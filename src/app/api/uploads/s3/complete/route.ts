import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isS3Mode } from '@/lib/storage'
import { s3CompleteMultipartUpload } from '@/lib/s3-storage'
import { sanitizeContentType } from '@/lib/file-validation'
import { verifyS3UploadAccess } from '@/lib/s3-upload-auth'
import { videoQueue, getAssetQueue, getProjectUploadQueue } from '@/lib/queue'
import { logError, logMessage } from '@/lib/logging'
import { rateLimit } from '@/lib/rate-limit'
import { handleReverseShareUploadNotification } from '@/lib/upload-notifications'
import type { CompletedPart } from '@aws-sdk/client-s3'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  if (!isS3Mode()) {
    return NextResponse.json({ error: 'S3 storage is not enabled' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const {
      uploadId,
      videoId,
      assetId,
      projectUploadId,
      parts,
      fileSize,
      contentType,
    } = body as {
      uploadId: string
      videoId?: string
      assetId?: string
      projectUploadId?: string
      parts: Array<{ partNumber: number; etag: string }>
      fileSize: number
      contentType?: string
    }

    if (!videoId && !assetId && !projectUploadId) {
      return NextResponse.json(
        { error: 'Missing required field: videoId, assetId, or projectUploadId' },
        { status: 400 }
      )
    }

    // ── Authentication & ownership ────────────────────────────────────────────
    const authResult = await verifyS3UploadAccess(request, { videoId, assetId, projectUploadId }, { requireUploadPermission: true })
    if (authResult.errorResponse) return authResult.errorResponse

    // ── Rate limit: 30 complete requests per minute per client ──────────���─────
    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 30,
      message: 'Too many upload requests. Please slow down.',
    }, 's3-complete')
    if (rateLimitResult) return rateLimitResult

    // ── Input validation ──────────────────────────────────────────────────────
    if (!uploadId || typeof uploadId !== 'string' || uploadId.length > 1024) {
      return NextResponse.json(
        { error: 'Missing or invalid field: uploadId' },
        { status: 400 }
      )
    }

    if (!parts?.length || parts.length > 10000) {
      return NextResponse.json(
        { error: 'Missing or invalid field: parts (must be 1–10000 items)' },
        { status: 400 }
      )
    }

    // Validate each part: number in 1–10000, ETag is a non-empty string
    for (const part of parts) {
      if (
        !Number.isInteger(part.partNumber) ||
        part.partNumber < 1 ||
        part.partNumber > 10000
      ) {
        return NextResponse.json({ error: 'Invalid part number' }, { status: 400 })
      }
      if (typeof part.etag !== 'string' || part.etag.length === 0 || part.etag.length > 256) {
        return NextResponse.json({ error: 'Invalid ETag in parts' }, { status: 400 })
      }
    }

    if (
      !fileSize ||
      !Number.isFinite(fileSize) ||
      !Number.isInteger(fileSize) ||
      fileSize <= 0
    ) {
      return NextResponse.json(
        { error: 'Missing or invalid field: fileSize (must be a positive integer)' },
        { status: 400 }
      )
    }

    // ── Derive S3 key from DB (never trust client-supplied key) ───────────────
    // Auth helper already resolved s3Key. For videos, re-check status (TOCTOU guard).
    let s3Key = authResult.s3Key
    let dbVideo: { id: string; originalStoragePath: string; projectId: string; status: string } | null = null
    let dbAsset: { id: string; storagePath: string; category: string | null } | null = null
    let dbProjectUpload: { id: string; storagePath: string; projectId: string; fileName: string; uploadedByName: string | null; uploadedByEmail: string | null } | null = null

    if (videoId) {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        select: { id: true, originalStoragePath: true, projectId: true, status: true },
      })
      if (!video) return NextResponse.json({ error: 'Video record not found' }, { status: 404 })
      if (video.status !== 'UPLOADING') {
        return NextResponse.json({ error: 'Video is no longer in UPLOADING state' }, { status: 409 })
      }
      s3Key = video.originalStoragePath
      dbVideo = video
    } else if (assetId) {
      dbAsset = await prisma.videoAsset.findUnique({
        where: { id: assetId },
        select: { id: true, storagePath: true, category: true },
      })
      if (!dbAsset) return NextResponse.json({ error: 'Asset record not found' }, { status: 404 })
    } else {
      const pu = await prisma.projectUpload.findUnique({
        where: { id: projectUploadId! },
        select: { id: true, storagePath: true, projectId: true, fileName: true, uploadedByName: true, uploadedByEmail: true },
      })
      if (!pu) return NextResponse.json({ error: 'Upload record not found' }, { status: 404 })
      dbProjectUpload = pu
    }

    // ── Complete the multipart upload on S3 ────────────────────────────────────
    // ETags must be quoted per HTTP/S3 spec. The browser client strips quotes
    // from the ETag header value, so re-add them if missing.
    //
    // CRITICAL: S3's CompleteMultipartUpload requires Parts in ascending
    // PartNumber order. The client uploads parts via a worker pool that
    // finishes them in non-deterministic order, so we MUST sort here. The
    // SDK does not sort for us — sending unsorted parts returns InvalidPartOrder
    // and the upload appears as "Failed to complete upload" to the user.
    const completedParts: CompletedPart[] = parts
      .map((p) => ({
        PartNumber: p.partNumber,
        ETag: p.etag.startsWith('"') ? p.etag : `"${p.etag}"`,
      }))
      .sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0))

    // CompleteMultipartUpload validates that every part is present and assembles
    // the object atomically.
    await s3CompleteMultipartUpload(s3Key, uploadId, completedParts)

    logMessage(`[S3 COMPLETE] Multipart upload complete for key: ${s3Key}`)

    // ── Update DB and trigger worker (mirrors TUS onUploadFinish) ─────────────
    if (dbVideo) {
      await prisma.video.update({
        where: { id: dbVideo.id },
        data: { status: 'PROCESSING', processingProgress: 0 },
      })

      await videoQueue.add('process-video', {
        videoId: dbVideo.id,
        originalStoragePath: dbVideo.originalStoragePath,
        projectId: dbVideo.projectId,
      })

      logMessage(`[S3 COMPLETE] Video ${dbVideo.id} queued for processing`)
    } else if (dbAsset) {
      const actualFileType = sanitizeContentType(contentType)

      await prisma.videoAsset.update({
        where: { id: dbAsset.id },
        data: {
          fileType: actualFileType,
          fileSize: BigInt(fileSize),
          uploadCompletedAt: new Date(),
        },
      })

      const assetQueue = getAssetQueue()
      await assetQueue.add('process-asset', {
        assetId: dbAsset.id,
        storagePath: dbAsset.storagePath,
        expectedCategory: dbAsset.category ?? undefined,
      })

      logMessage(`[S3 COMPLETE] Asset ${dbAsset.id} queued for processing`)
    } else if (dbProjectUpload) {
      const actualFileType = sanitizeContentType(contentType)

      await prisma.projectUpload.update({
        where: { id: dbProjectUpload.id },
        data: {
          fileType: actualFileType,
          fileSize: BigInt(fileSize),
          uploadCompletedAt: new Date(),
        },
      })

      const projectUploadQueue = getProjectUploadQueue()
      await projectUploadQueue.add('process-upload', {
        uploadId: dbProjectUpload.id,
        storagePath: dbProjectUpload.storagePath,
        projectId: dbProjectUpload.projectId,
      })

      logMessage(`[S3 COMPLETE] ProjectUpload ${dbProjectUpload.id} complete`)

      // Fire-and-forget notification to admins
      void handleReverseShareUploadNotification({
        projectId: dbProjectUpload.projectId,
        fileName: dbProjectUpload.fileName,
        uploaderName: dbProjectUpload.uploadedByName,
        uploaderEmail: dbProjectUpload.uploadedByEmail,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logError('[S3 COMPLETE] Error:', error)
    return NextResponse.json({ error: 'Failed to complete upload' }, { status: 500 })
  }
}
