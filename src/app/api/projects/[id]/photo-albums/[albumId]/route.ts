import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { deleteDirectory } from '@/lib/storage'
import { z } from 'zod'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

const updateAlbumSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  coverPhotoId: z.string().min(1).optional(),
}).refine(data => data.name !== undefined || data.coverPhotoId !== undefined, {
  message: 'Nothing to update',
})

// PATCH /api/projects/[id]/photo-albums/[albumId] - Rename album / set cover (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; albumId: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const photoMessages = messages?.photos || {}

  const { id: projectId, albumId } = await params

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: photoMessages.tooManyRequests || 'Too many requests. Please slow down.',
  }, 'photo-album-rename')
  if (rateLimitResult) return rateLimitResult

  try {
    const album = await prisma.photoAlbum.findUnique({
      where: { id: albumId },
      select: { id: true, projectId: true },
    })

    if (!album || album.projectId !== projectId) {
      return NextResponse.json({ error: photoMessages.albumNotFound || 'Album not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateAlbumSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: photoMessages.invalidAlbumName || 'Invalid album name' }, { status: 400 })
    }

    if (parsed.data.coverPhotoId) {
      const photo = await prisma.photo.findUnique({
        where: { id: parsed.data.coverPhotoId },
        select: { albumId: true, uploadCompletedAt: true },
      })
      if (!photo || photo.albumId !== albumId || !photo.uploadCompletedAt) {
        return NextResponse.json({ error: photoMessages.photoNotFound || 'Photo not found' }, { status: 404 })
      }
    }

    const updated = await prisma.photoAlbum.update({
      where: { id: albumId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.coverPhotoId !== undefined ? { coverPhotoId: parsed.data.coverPhotoId } : {}),
      },
    })

    return NextResponse.json({ album: { id: updated.id, name: updated.name, coverPhotoId: updated.coverPhotoId } })
  } catch (error) {
    logError('Error renaming photo album:', error)
    return NextResponse.json(
      { error: photoMessages.failedToUpdateAlbum || 'Failed to update photo album' },
      { status: 500 }
    )
  }
}

// DELETE /api/projects/[id]/photo-albums/[albumId] - Delete album + storage (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; albumId: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const photoMessages = messages?.photos || {}

  const { id: projectId, albumId } = await params

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: photoMessages.tooManyRequests || 'Too many requests. Please slow down.',
  }, 'photo-album-delete')
  if (rateLimitResult) return rateLimitResult

  try {
    const album = await prisma.photoAlbum.findUnique({
      where: { id: albumId },
      select: { id: true, projectId: true },
    })

    if (!album || album.projectId !== projectId) {
      return NextResponse.json({ error: photoMessages.albumNotFound || 'Album not found' }, { status: 404 })
    }

    await prisma.photoAlbum.delete({ where: { id: albumId } })

    // Remove album files (originals + thumbnails) from storage
    try {
      await deleteDirectory(`projects/${projectId}/photos/${albumId}`)
    } catch (storageError) {
      logError('Error deleting album storage directory:', storageError)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logError('Error deleting photo album:', error)
    return NextResponse.json(
      { error: photoMessages.failedToDeleteAlbum || 'Failed to delete photo album' },
      { status: 500 }
    )
  }
}
