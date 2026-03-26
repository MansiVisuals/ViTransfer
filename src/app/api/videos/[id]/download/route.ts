import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getFilePath, sanitizeFilenameForHeader, getVideoContentType } from '@/lib/storage'
import { verifyProjectAccess } from '@/lib/project-access'
import { rateLimit } from '@/lib/rate-limit'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import fs from 'fs'
import { createReadStream } from 'fs'
import { logError } from '@/lib/logging'
import { STREAM_HIGH_WATER_MARK_BYTES, parseBoundedRangeHeader } from '@/lib/transfer-tuning'

export const runtime = 'nodejs'




export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const videoMessages = messages?.videos || {}

  // Rate limiting: 30 downloads per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: videoMessages.tooManyDirectDownloadRequests || 'Too many download requests. Please slow down.'
  }, 'video-download')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { id } = await params

    // Get video metadata
    const video = await prisma.video.findUnique({
      where: { id },
      include: { project: true },
    })

    if (!video) {
      return NextResponse.json({ error: videoMessages.videoNotFoundApi || 'Video not found' }, { status: 404 })
    }

    // SECURITY: Verify user has access to this project (admin OR valid share session)
    const accessCheck = await verifyProjectAccess(request, video.project.id, video.project.sharePassword, video.project.authMode, {
      allowGuest: false,
      requiredPermission: 'download',
    })
    if (!accessCheck.authorized) {
      return NextResponse.json({ error: videoMessages.unauthorizedApi || 'Unauthorized' }, { status: 403 })
    }

    if (!accessCheck.isAdmin) {
      if (!video.project.allowAssetDownload) {
        return NextResponse.json({ error: videoMessages.downloadsDisabledForProject || 'Downloads are disabled for this project' }, { status: 403 })
      }

      if (!video.approved) {
        return NextResponse.json({ error: videoMessages.downloadsAvailableAfterApproval || 'Downloads available after approval' }, { status: 403 })
      }
    }

    // Choose safest available file based on role/approval
    let filePath: string | null = null
    if (accessCheck.isAdmin) {
      filePath = video.originalStoragePath || video.preview1080Path || video.preview720Path || null
    } else {
      filePath = video.originalStoragePath || null
    }

    if (!filePath) {
      return NextResponse.json({ error: videoMessages.fileNotFound || 'File not found' }, { status: 404 })
    }

    // Get the full file path
    const fullPath = getFilePath(filePath)

    // Check if file exists and get stats
    const stat = await fs.promises.stat(fullPath)
    if (!stat.isFile()) {
      return NextResponse.json({ error: videoMessages.fileNotFound || 'File not found' }, { status: 404 })
    }

    // Use the original filename from the database, guard against missing values
    const originalFilename = video.originalFileName || 'video.mp4'
    const safeFilename = sanitizeFilenameForHeader(originalFilename)
    const contentType = getVideoContentType(originalFilename)

    const range = request.headers.get('range')

    if (range) {
      const parsedRange = parseBoundedRangeHeader(range, stat.size, 16 * 1024 * 1024)
      if (!parsedRange) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${stat.size}` },
        })
      }

      const { start, end } = parsedRange
      const chunkSize = (end - start) + 1
      const fileStream = createReadStream(fullPath, { start, end, highWaterMark: STREAM_HIGH_WATER_MARK_BYTES })

      const readableStream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => controller.enqueue(chunk))
          fileStream.on('end', () => controller.close())
          fileStream.on('error', (err) => controller.error(err))
        },
        cancel() {
          fileStream.destroy()
        },
      })

      return new NextResponse(readableStream, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${safeFilename}"`,
          'Content-Length': chunkSize.toString(),
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-cache',
        },
      })
    }

    const fileStream = createReadStream(fullPath, { highWaterMark: STREAM_HIGH_WATER_MARK_BYTES })

    // Convert Node.js stream to Web API ReadableStream
    const readableStream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => controller.enqueue(chunk))
        fileStream.on('end', () => controller.close())
        fileStream.on('error', (err) => controller.error(err))
      },
      cancel() {
        fileStream.destroy()
      },
    })

    // Return file with proper headers for download
    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
        // Security headers
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    logError('Download error:', error)
    return NextResponse.json(
      { error: videoMessages.failedToDownloadVideoFile || 'Failed to download file' },
      { status: 500 }
    )
  }
}
