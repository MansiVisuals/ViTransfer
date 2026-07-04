import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { deleteFile } from '@/lib/storage'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

// DELETE /api/projects/[id]/photo-albums/[albumId]/photos/[photoId] - Delete photo (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; albumId: string; photoId: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const photoMessages = messages?.photos || {}

  const { id: projectId, albumId, photoId } = await params

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 120,
    message: photoMessages.tooManyRequests || 'Too many requests. Please slow down.',
  }, 'photo-delete')
  if (rateLimitResult) return rateLimitResult

  try {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: { album: { select: { id: true, projectId: true } } },
    })

    if (!photo || photo.albumId !== albumId || photo.album.projectId !== projectId) {
      return NextResponse.json({ error: photoMessages.photoNotFound || 'Photo not found' }, { status: 404 })
    }

    await prisma.photo.delete({ where: { id: photoId } })

    // Remove original + renditions from storage
    try {
      await deleteFile(photo.storagePath)
      if (photo.thumbnailPath) {
        await deleteFile(photo.thumbnailPath)
      }
      if (photo.previewPath) {
        await deleteFile(photo.previewPath)
      }
    } catch (storageError) {
      logError('Error deleting photo files from storage:', storageError)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logError('Error deleting photo:', error)
    return NextResponse.json(
      { error: photoMessages.failedToDeletePhoto || 'Failed to delete photo' },
      { status: 500 }
    )
  }
}
