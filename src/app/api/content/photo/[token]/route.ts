import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { downloadFile, sanitizeFilenameForHeader, isS3Mode } from '@/lib/storage'
import { s3GetPresignedDownloadUrl, s3GetPresignedStreamUrl } from '@/lib/s3-storage'
import { rateLimit } from '@/lib/rate-limit'
import { verifyAlbumAccessToken, trackPhotoDownload } from '@/lib/photo-access'
import { isRawPhotoMime } from '@/lib/file-validation'
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

    // FS mode serves every grid tile from here, one request per photo, so the
    // ceiling has to clear a scroll through several 200-photo pages. S3 mode
    // barely touches this route — the grid links presigned objects directly.
    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: Math.max(securitySettings.ipRateLimit, 1200),
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

    if (isDownload && !verifiedToken.isAdmin && (verifiedToken.isGuest || !photo.album.project.allowPhotoDownload)) {
      return NextResponse.json(
        { error: photoMessages.downloadsNotAllowed || 'Photo downloads are not allowed for this project' },
        { status: 403 }
      )
    }

    // Viewing serves worker-generated webp renditions (thumb or preview) —
    // originals can be 25-90 MB and are only streamed for explicit downloads.
    // previewPath falls back to the original for photos processed before previews existed;
    // a raw has no such fallback, since no browser can render one.
    const useThumb = variant === 'thumb' && !isDownload
    const useWebpRendition = !isDownload
    const viewFallback = isRawPhotoMime(photo.fileType) ? null : photo.storagePath
    const filePath = isDownload
      ? photo.storagePath
      : useThumb
        ? photo.thumbnailPath
        : photo.previewPath || viewFallback

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

    const servingWebp = useThumb || (useWebpRendition && !!photo.previewPath)
    const contentType = servingWebp ? 'image/webp' : photo.fileType

    // S3 mode: redirect the browser straight to the object, same as videos.
    // Proxying every tile through the app holds one SDK socket per in-flight
    // request against a pool of 50, so a grid of thumbnails starves itself.
    if (isS3Mode()) {
      const presignedUrl = isDownload
        ? await s3GetPresignedDownloadUrl(filePath, 3600, sanitizeFilenameForHeader(photo.fileName), photo.fileType)
        : await s3GetPresignedStreamUrl(filePath, 300, contentType)
      return NextResponse.redirect(presignedUrl, {
        status: 302,
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    const fileStream = await downloadFile(filePath)
    const webStream = Readable.toWeb(fileStream as any) as ReadableStream

    const headers: Record<string, string> = {
      'Content-Type': contentType,
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
