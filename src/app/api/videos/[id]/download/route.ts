import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getFilePath, sanitizeFilenameForHeader } from '@/lib/storage'
import { verifyProjectAccess } from '@/lib/project-access'
import { rateLimit } from '@/lib/rate-limit'
import fs from 'fs'
import { createReadStream } from 'fs'
import { Readable } from 'stream'
export const runtime = 'nodejs'




export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limiting: 30 downloads per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many download requests. Please slow down.'
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
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // SECURITY: Verify user has access to this project (admin OR valid share session)
    const accessCheck = await verifyProjectAccess(request, video.project.id, video.project.sharePassword, video.project.authMode)
    if (!accessCheck.authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (!accessCheck.isAdmin) {
      if (!video.project.allowAssetDownload) {
        return NextResponse.json({ error: 'Downloads are disabled for this project' }, { status: 403 })
      }

      if (!video.approved) {
        return NextResponse.json({ error: 'Downloads available after approval' }, { status: 403 })
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
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Get the full file path
    const fullPath = getFilePath(filePath)

    // Check if file exists and get stats
    const stat = await fs.promises.stat(fullPath)
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Use the original filename from the database, guard against missing values
    const originalFilename = video.originalFileName || 'video.mp4'
    const safeFilename = sanitizeFilenameForHeader(originalFilename)

    // CRITICAL FIX: Stream file instead of loading into memory
    // This prevents OOM crashes with large video files
    const fileStream = createReadStream(fullPath)

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
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': stat.size.toString(),
        // Security headers
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: 'Failed to download file' },
      { status: 500 }
    )
  }
}
