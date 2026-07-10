import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { verifyProjectAccess } from '@/lib/project-access'
import { generateAlbumAccessToken } from '@/lib/photo-access'
import { z } from 'zod'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

const createAlbumSchema = z.object({
  name: z.string().trim().min(1).max(100),
})

// GET /api/projects/[id]/photo-albums - List albums with photo counts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const photoMessages = messages?.photos || {}

  const { id: projectId } = await params

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: photoMessages.tooManyRequests || 'Too many requests. Please slow down.',
  }, 'photo-albums-list')
  if (rateLimitResult) return rateLimitResult

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, sharePassword: true, authMode: true, guestShowPhotos: true },
    })

    if (!project) {
      return NextResponse.json({ error: photoMessages.projectNotFound || 'Project not found' }, { status: 404 })
    }

    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword, project.authMode, {
      allowGuest: project.guestShowPhotos,
      requiredPermission: 'view',
    })
    if (!accessCheck.authorized) {
      return NextResponse.json({ error: photoMessages.unauthorized || 'Unauthorized' }, { status: 403 })
    }

    const albums = await prisma.photoAlbum.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: {
        coverPhoto: { select: { id: true, thumbnailPath: true } },
        photos: {
          where: { uploadCompletedAt: { not: null }, thumbnailPath: { not: null } },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { id: true },
        },
        _count: {
          select: { photos: { where: { uploadCompletedAt: { not: null } } } },
        },
      },
    })

    const sessionId = accessCheck.shareTokenSessionId || `guest:${Date.now()}`

    // Mint a content token per album so covers can render (cached per session).
    // Cover: admin-selected photo when set (and processed), else first photo.
    const serializedAlbums = await Promise.all(albums.map(async album => {
      const coverId = (album.coverPhoto?.thumbnailPath ? album.coverPhoto.id : null) ?? album.photos[0]?.id ?? null
      return {
        id: album.id,
        name: album.name,
        photoCount: album._count.photos,
        coverPhotoId: coverId,
        contentToken: coverId
          ? await generateAlbumAccessToken(album.id, projectId, request, sessionId, accessCheck.isGuest === true)
          : null,
        createdAt: album.createdAt,
      }
    }))

    return NextResponse.json({ albums: serializedAlbums })
  } catch (error) {
    logError('Error fetching photo albums:', error)
    return NextResponse.json(
      { error: photoMessages.failedToFetchAlbums || 'Failed to fetch photo albums' },
      { status: 500 }
    )
  }
}

// POST /api/projects/[id]/photo-albums - Create album (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const photoMessages = messages?.photos || {}

  const { id: projectId } = await params

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: photoMessages.tooManyRequests || 'Too many requests. Please slow down.',
  }, 'photo-albums-create')
  if (rateLimitResult) return rateLimitResult

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    })

    if (!project) {
      return NextResponse.json({ error: photoMessages.projectNotFound || 'Project not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = createAlbumSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: photoMessages.invalidAlbumName || 'Invalid album name' }, { status: 400 })
    }

    const album = await prisma.photoAlbum.create({
      data: {
        projectId,
        name: parsed.data.name,
      },
    })

    return NextResponse.json({
      album: {
        id: album.id,
        name: album.name,
        photoCount: 0,
        coverPhotoId: null,
        createdAt: album.createdAt,
      },
    })
  } catch (error) {
    logError('Error creating photo album:', error)
    return NextResponse.json(
      { error: photoMessages.failedToCreateAlbum || 'Failed to create photo album' },
      { status: 500 }
    )
  }
}
