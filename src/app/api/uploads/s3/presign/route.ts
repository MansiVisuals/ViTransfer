import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isS3Mode } from '@/lib/storage'
import {
  s3InitiateMultipartUpload,
  s3GetPresignedPartUrl,
} from '@/lib/s3-storage'
import { ALL_ALLOWED_EXTENSIONS } from '@/lib/asset-validation'
import { FILE_LIMITS, sanitizeContentType } from '@/lib/file-validation'
import { verifyS3UploadAccess } from '@/lib/s3-upload-auth'
import { logError } from '@/lib/logging'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// Minimum part size: 5 MiB (S3 requirement for all parts except the last)
const MIN_PART_SIZE = 5 * 1024 * 1024
// Default part size: 25 MiB
const DEFAULT_PART_SIZE = 25 * 1024 * 1024
// Presigned URL expiry: 1 hour per part
const PART_URL_EXPIRY_SECONDS = 3600
// Hard limit on upload size (1000 GB)
const ABSOLUTE_MAX_UPLOAD_SIZE = 1000 * 1024 * 1024 * 1024

function calculatePartSize(fileSize: number): number {
  // Keep part count under 9,500 (S3 max is 10,000) for very large files
  const sizeForLimit = Math.ceil(fileSize / 9500)
  return Math.max(DEFAULT_PART_SIZE, sizeForLimit, MIN_PART_SIZE)
}

export async function POST(request: NextRequest) {
  if (!isS3Mode()) {
    return NextResponse.json({ error: 'S3 storage is not enabled' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const { videoId, assetId, projectUploadId, filename, contentType, fileSize } = body as {
      videoId?: string
      assetId?: string
      projectUploadId?: string
      filename: string
      contentType: string
      fileSize: number
    }

    if (!videoId && !assetId && !projectUploadId) {
      return NextResponse.json(
        { error: 'Missing required field: videoId, assetId, or projectUploadId' },
        { status: 400 }
      )
    }

    // ── Authentication & ownership ──────────────────────────────────────────────
    const authResult = await verifyS3UploadAccess(request, { videoId, assetId, projectUploadId }, { requireUploadPermission: true })
    if (authResult.errorResponse) return authResult.errorResponse

    // ── Rate limit: 30 presign requests per minute per client ─────────────────
    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 30,
      message: 'Too many upload requests. Please slow down.',
    }, 's3-presign')
    if (rateLimitResult) return rateLimitResult

    // ── Input validation ──────────────────────────────────────────────────────
    // Sanitize filename: reject null bytes, path separators, and excessively long names
    if (!filename || typeof filename !== 'string') {
      return NextResponse.json({ error: 'Missing required field: filename' }, { status: 400 })
    }
    const sanitizedFilename = filename.replace(/[\x00/\\]/g, '').trim()
    if (!sanitizedFilename || sanitizedFilename.length > 255) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    if (!contentType || typeof contentType !== 'string' || contentType.length > 256) {
      return NextResponse.json({ error: 'Missing or invalid required field: contentType' }, { status: 400 })
    }
    const sanitizedContentType = sanitizeContentType(contentType)
    if (sanitizedContentType === 'application/octet-stream' && contentType !== 'application/octet-stream') {
      return NextResponse.json({ error: 'Invalid content type format' }, { status: 400 })
    }

    if (
      !fileSize ||
      !Number.isFinite(fileSize) ||
      !Number.isInteger(fileSize) ||
      fileSize <= 0
    ) {
      return NextResponse.json(
        { error: 'Missing or invalid required field: fileSize (must be a positive integer)' },
        { status: 400 }
      )
    }

    if (fileSize > ABSOLUTE_MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: 'File exceeds maximum allowed size (1000 GB)' }, { status: 413 })
    }

    // ── Enforce per-project max upload size ────────────────────────────────────
    const appSettings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { maxUploadSizeGB: true },
    })
    const maxUploadSizeBytes = (appSettings?.maxUploadSizeGB ?? 1) * 1024 * 1024 * 1024
    if (fileSize > maxUploadSizeBytes) {
      return NextResponse.json(
        { error: `Upload exceeds maximum allowed size of ${appSettings?.maxUploadSizeGB ?? 1} GB` },
        { status: 413 }
      )
    }

    // ── Validate file extension ────────────────────────────────────────────────
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))
    if (videoId) {
      if (!FILE_LIMITS.ALLOWED_EXTENSIONS.includes(ext)) {
        return NextResponse.json(
          { error: `Invalid video format: ${ext}. Allowed: ${FILE_LIMITS.ALLOWED_EXTENSIONS.join(', ')}` },
          { status: 400 }
        )
      }
    } else {
      if (!ALL_ALLOWED_EXTENSIONS.includes(ext)) {
        return NextResponse.json(
          { error: `Invalid file type: ${ext}` },
          { status: 400 }
        )
      }
    }

    // ── Resolve S3 key from DB ─────────────────────────────────────────────────
    // Auth helper already resolved s3Key for non-video uploads.
    // For videos, we need extra status check so re-fetch here.
    let s3Key = authResult.s3Key
    if (videoId) {
      const video = await prisma.video.findUnique({ where: { id: videoId }, select: { status: true, originalStoragePath: true } })
      if (!video) return NextResponse.json({ error: 'Video record not found' }, { status: 404 })
      if (video.status !== 'UPLOADING') {
        return NextResponse.json({ error: 'Video is not in UPLOADING state' }, { status: 400 })
      }
      s3Key = video.originalStoragePath
    }

    // ── Create multipart upload and presign all part URLs ─────────────────────
    const partSize = calculatePartSize(fileSize)
    const partCount = Math.ceil(fileSize / partSize)

    const uploadId = await s3InitiateMultipartUpload(s3Key, sanitizedContentType)

    const parts = await Promise.all(
      Array.from({ length: partCount }, (_, i) => i + 1).map(async (partNumber) => ({
        partNumber,
        url: await s3GetPresignedPartUrl(s3Key, uploadId, partNumber, PART_URL_EXPIRY_SECONDS),
      }))
    )

    return NextResponse.json({ uploadId, partSize, parts })
  } catch (error) {
    logError('[S3 PRESIGN] Error:', error)
    return NextResponse.json({ error: 'Failed to initiate upload' }, { status: 500 })
  }
}
