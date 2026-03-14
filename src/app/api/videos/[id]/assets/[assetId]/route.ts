import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { getFilePath, deleteFile, sanitizeFilenameForHeader } from '@/lib/storage'
import { verifyProjectAccess } from '@/lib/project-access'
import { createReadStream } from 'fs'
import fs from 'fs'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'
import { STREAM_HIGH_WATER_MARK_BYTES, parseBoundedRangeHeader } from '@/lib/transfer-tuning'

export const runtime = 'nodejs'




// GET /api/videos/[id]/assets/[assetId] - Download asset
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const videoMessages = messages?.videos || {}

  const { id: videoId, assetId } = await params

  // Rate limiting
  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 30,
  message: videoMessages.tooManyAssetDownloadRequests || 'Too many download requests. Please slow down.',
    },
    'video-asset-download'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    // Get asset with video and project info
    const asset = await prisma.videoAsset.findUnique({
      where: { id: assetId },
      include: {
        video: {
          include: {
            project: true,
          },
        },
      },
    })

    if (!asset || asset.videoId !== videoId) {
  return NextResponse.json({ error: messages?.share?.assetNotFound || 'Asset not found' }, { status: 404 })
    }

    const project = asset.video.project

    // SECURITY: Verify user has access to this project (admin OR valid share session)
    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword, project.authMode, {
      allowGuest: false,
      requiredPermission: 'download',
    })
    if (!accessCheck.authorized) {
  return NextResponse.json({ error: videoMessages.unauthorizedApi || 'Unauthorized' }, { status: 403 })
    }

    // For non-admins, verify asset download settings and video approval
    if (!accessCheck.isAdmin) {
      // Check if project allows asset downloads
      if (!project.allowAssetDownload) {
        return NextResponse.json(
          { error: videoMessages.assetDownloadsNotAllowedProject || 'Asset downloads are not allowed for this project' },
          { status: 403 }
        )
      }

      // Check if video is approved (assets only available for approved videos)
      if (!asset.video.approved) {
        return NextResponse.json(
          { error: videoMessages.assetsApprovedOnly || 'Assets are only available for approved videos' },
          { status: 403 }
        )
      }
    }

    // Get the full file path and check if exists
    const fullPath = getFilePath(asset.storagePath)
    const stat = await fs.promises.stat(fullPath)
    if (!stat.isFile()) {
  return NextResponse.json({ error: videoMessages.fileNotFound || 'File not found' }, { status: 404 })
    }

    const sanitizedFilename = sanitizeFilenameForHeader(asset.fileName)
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
          fileStream.on('error', (err) => {
            fileStream.destroy()
            controller.error(err)
          })
        },
        cancel() {
          fileStream.destroy()
        },
      })

      return new NextResponse(readableStream, {
        status: 206,
        headers: {
          'Content-Type': asset.fileType,
          'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
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
        fileStream.on('error', (err) => {
          fileStream.destroy()
          controller.error(err)
        })
      },
      cancel() {
        fileStream.destroy()
      },
    })

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': asset.fileType,
        'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error) {
    logError('Error downloading asset:', error)
    return NextResponse.json(
      { error: videoMessages.failedToDownloadAsset || 'Failed to download asset' },
      { status: 500 }
    )
  }
}

// DELETE /api/videos/[id]/assets/[assetId] - Delete asset
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const videoMessages = messages?.videos || {}

  const { id: videoId, assetId } = await params

  // Authentication - admin only
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting
  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 20,
  message: videoMessages.tooManyAssetDeleteRequests || 'Too many delete requests. Please slow down.',
    },
    'video-asset-delete'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    // Get asset with video info
    const asset = await prisma.videoAsset.findUnique({
      where: { id: assetId },
      include: {
        video: true,
      },
    })

    if (!asset || asset.videoId !== videoId) {
  return NextResponse.json({ error: messages?.share?.assetNotFound || 'Asset not found' }, { status: 404 })
    }

    // Check if this asset is being used as the video's thumbnail
    const isCurrentThumbnail = asset.video.thumbnailPath === asset.storagePath

    // Only delete the physical file if no other assets reference the same storage path
    const sharedCount = await prisma.videoAsset.count({
      where: {
        storagePath: asset.storagePath,
        id: { not: assetId },
      },
    })

    if (sharedCount === 0) {
      await deleteFile(asset.storagePath)
    }

    // If this asset was the current thumbnail, revert to system-generated thumbnail
    if (isCurrentThumbnail) {
      // System-generated thumbnail path: projects/{projectId}/videos/{videoId}/thumbnail.jpg
      const systemThumbnailPath = `projects/${asset.video.projectId}/videos/${videoId}/thumbnail.jpg`

      await prisma.video.update({
        where: { id: videoId },
        data: {
          thumbnailPath: systemThumbnailPath,
        },
      })
    }

    // Delete database record
    await prisma.videoAsset.delete({
      where: { id: assetId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logError('Error deleting asset:', error)
    return NextResponse.json(
      { error: videoMessages.failedToDeleteAssetApi || 'Failed to delete asset' },
      { status: 500 }
    )
  }
}
