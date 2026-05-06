import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { getFilePath, sanitizeFilenameForHeader, isS3Mode, createWebReadableStream } from '@/lib/storage'
import { s3GetPresignedDownloadUrl, s3FileExists } from '@/lib/s3-storage'
import { getRedis, consumeTokenAtomically } from '@/lib/redis'
import { getClientIpAddress } from '@/lib/utils'
import { createReadStream, existsSync } from 'fs'
import { logError } from '@/lib/logging'
import crypto from 'crypto'

export const runtime = 'nodejs'

// GET /api/projects/[id]/project-uploads/[uploadId]/download
//
// Two auth paths:
//  1. ?dlt=<token>  — single-use token from /download-token, allows the
//     admin browser to navigate directly via <a href download> so the
//     native save dialog appears immediately (no fetch-into-blob detour).
//  2. Authorization: Bearer <admin>  — for direct API consumers.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  const url = new URL(request.url)
  const dlt = url.searchParams.get('dlt')

  let projectId: string
  let uploadId: string
  ;({ id: projectId, uploadId } = await params)

  if (dlt) {
    // Token path — verify token then stream. Same rate limit applies.
    const rl = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 30,
      message: 'Too many requests. Please slow down.',
    }, 'project-uploads-download-tok')
    if (rl) return rl

    const redis = getRedis()
    const tokenKey = `project_upload_dl:${dlt}`
    const raw = await redis.get(tokenKey)
    if (!raw) {
      return NextResponse.json({ error: 'Invalid or expired download link' }, { status: 403 })
    }
    let payload: { projectId?: string; uploadId?: string; ipAddress?: string; userAgentHash?: string }
    try { payload = JSON.parse(raw) } catch { payload = {} }

    if (payload.projectId !== projectId || payload.uploadId !== uploadId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    const requestIp = getClientIpAddress(request)
    const requestUaHash = crypto
      .createHash('sha256')
      .update(request.headers.get('user-agent') || 'unknown')
      .digest('hex')
    if (payload.ipAddress !== requestIp || payload.userAgentHash !== requestUaHash) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const consumed = await consumeTokenAtomically(redis, tokenKey, raw)
    if (!consumed) {
      return NextResponse.json({ error: 'Invalid or expired download link' }, { status: 403 })
    }
  } else {
    // Bearer admin path
    const authResult = await requireApiAdmin(request)
    if (authResult instanceof Response) return authResult

    const rl = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 30,
      message: 'Too many requests. Please slow down.',
    }, 'project-uploads-download')
    if (rl) return rl
  }

  try {

    const upload = await prisma.projectUpload.findFirst({
      where: { id: uploadId, projectId },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        storagePath: true,
      },
    })

    if (!upload) {
      return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
    }

    const safeFileName = sanitizeFilenameForHeader(upload.fileName)

    // ── S3 mode: redirect directly to presigned URL ──────────────────────────
    if (isS3Mode()) {
      const exists = await s3FileExists(upload.storagePath)
      if (!exists) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
      const presignedUrl = await s3GetPresignedDownloadUrl(
        upload.storagePath,
        3600,
        safeFileName,
        upload.fileType || 'application/octet-stream'
      )
      return NextResponse.redirect(presignedUrl, {
        status: 302,
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    const filePath = getFilePath(upload.storagePath)

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
    }

    const fileStream = createReadStream(filePath)
    const webStream = createWebReadableStream(fileStream)

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': upload.fileType || 'application/octet-stream',
        'Content-Length': upload.fileSize.toString(),
        'Content-Disposition': `attachment; filename="${safeFileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    logError('Error downloading project upload:', error)
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
  }
}
