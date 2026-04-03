import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { getFilePath, sanitizeFilenameForHeader, isS3Mode, createWebReadableStream } from '@/lib/storage'
import { s3GetPresignedDownloadUrl, s3FileExists } from '@/lib/s3-storage'
import { createReadStream, existsSync } from 'fs'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

// GET /api/projects/[id]/project-uploads/[uploadId]/download — admin streams a project upload
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) return authResult

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many requests. Please slow down.',
  }, 'project-uploads-download')
  if (rateLimitResult) return rateLimitResult

  try {
    const { id: projectId, uploadId } = await params

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
