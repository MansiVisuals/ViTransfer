import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { downloadFile, sanitizeFilenameForHeader } from '@/lib/storage'
import { rateLimit } from '@/lib/rate-limit'
import { verifyAlbumAccessToken, trackPhotoDownload } from '@/lib/photo-access'
import { getSecuritySettings } from '@/lib/video-access'
import { Readable } from 'stream'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Photo content delivery - streams thumbnails and originals with
 * album-token authentication (mirrors /api/content/[token] for videos).
 *
 * Query params:
 * - photoId: photo to serve (must belong to the token's album)
 * - variant: 'thumb' (default) or 'full'
 * - download: 'true' to force attachment (requires download permission)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const locale = await getConfiguredLocale().catch(() => 'en')
    const messages = await loadLocaleMessages(locale).catch(() => null)
    const photoMessages = messages?.photos || {}

    const { token } = await params
    const { searchParams } = new URL(request.url)
    const photoId = searchParams.get('photoId')
    const variant = searchParams.get('variant') === 'full' ? 'full' : 'thumb'
    const isDownload = searchParams.get('download') === 'true'

    const securitySettings = await getSecuritySettings()

    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: securitySettings.ipRateLimit,
      message: photoMessages.tooManyRequests || 'Too many requests. Please slow down.',
    }, 'photo-content-ip')
    if (rateLimitResult) return rateLimitResult

    if (!photoId) {
      return NextResponse.json({ error: photoMessages.photoNotFound || 'Photo not found' }, { status: 400 })
    }

    const verifiedToken = await verifyAlbumAccessToken(token)
    if (!verifiedToken) {
      return NextResponse.json({ error: photoMessages.accessDenied || 'Access denied' }, { status: 403 })
    }

    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: {
        album: {
          select: {
            id: true,
            projectId: true,
            project: { select: { allowPhotoDownload: true } },
          },
        },
      },
    })

    if (
      !photo ||
      photo.albumId !== verifiedToken.albumId ||
      photo.album.projectId !== verifiedToken.projectId ||
      !photo.uploadCompletedAt
    ) {
      return NextResponse.json({ error: photoMessages.photoNotFound || 'Photo not found' }, { status: 404 })
    }

    if (isDownload && !verifiedToken.isAdmin && !photo.album.project.allowPhotoDownload) {
      return NextResponse.json(
        { error: photoMessages.downloadsNotAllowed || 'Photo downloads are not allowed for this project' },
        { status: 403 }
      )
    }

    // Viewing serves worker-generated webp renditions (thumb or preview) —
    // originals can be 25-90 MB and are only streamed for explicit downloads.
    // previewPath falls back to the original for photos processed before previews existed.
    const useThumb = variant === 'thumb' && !isDownload
    const useWebpRendition = !isDownload
    const filePath = isDownload
      ? photo.storagePath
      : useThumb
        ? photo.thumbnailPath
        : photo.previewPath || photo.storagePath

    if (!filePath) {
      return NextResponse.json({ error: photoMessages.photoNotFound || 'Photo not found' }, { status: 404 })
    }

    // Track single-photo downloads fire-and-forget (viewing is not tracked)
    if (isDownload) {
      void trackPhotoDownload({
        projectId: verifiedToken.projectId,
        albumId: photo.albumId,
        photoIds: [photo.id],
        isAdmin: verifiedToken.isAdmin,
      }).catch(() => {})
    }

    const fileStream = await downloadFile(filePath)
    const webStream = Readable.toWeb(fileStream as any) as ReadableStream

    const servingWebp = useThumb || (useWebpRendition && !!photo.previewPath)
    const headers: Record<string, string> = {
      'Content-Type': servingWebp ? 'image/webp' : photo.fileType,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    }

    // Content-Length is only known for the original file
    if (filePath === photo.storagePath) {
      headers['Content-Length'] = photo.fileSize.toString()
    }

    if (isDownload) {
      headers['Content-Disposition'] = `attachment; filename="${sanitizeFilenameForHeader(photo.fileName)}"`
    } else {
      headers['Content-Disposition'] = 'inline'
    }

    return new NextResponse(webStream, { headers })
  } catch (error) {
    logError('[PHOTO CONTENT] Error streaming photo:', error)
    return NextResponse.json({ error: 'Failed to load photo' }, { status: 500 })
  }
}
