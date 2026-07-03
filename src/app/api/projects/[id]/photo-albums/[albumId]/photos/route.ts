import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUserFromRequest, requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { verifyProjectAccess } from '@/lib/project-access'
import { validatePhotoFile } from '@/lib/file-validation'
import { generateAlbumAccessToken } from '@/lib/photo-access'
import { z } from 'zod'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

const createPhotoSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.union([z.number(), z.string()])
    .transform(val => Number(val))
    .refine(val => Number.isFinite(val) && Number.isInteger(val) && val > 0 && val <= Number.MAX_SAFE_INTEGER, {
      message: 'fileSize must be a positive integer',
    }),
  mimeType: z.string().max(255).optional(),
})

// GET /api/projects/[id]/photo-albums/[albumId]/photos - List photos + album content token
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; albumId: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const photoMessages = messages?.photos || {}

  const { id: projectId, albumId } = await params

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: photoMessages.tooManyRequests || 'Too many requests. Please slow down.',
  }, 'photos-list')
  if (rateLimitResult) return rateLimitResult

  try {
    const album = await prisma.photoAlbum.findUnique({
      where: { id: albumId },
      include: { project: { select: { id: true, sharePassword: true, authMode: true } } },
    })

    if (!album || album.projectId !== projectId) {
      return NextResponse.json({ error: photoMessages.albumNotFound || 'Album not found' }, { status: 404 })
    }

    const accessCheck = await verifyProjectAccess(request, projectId, album.project.sharePassword, album.project.authMode, {
      allowGuest: false,
      requiredPermission: 'view',
    })
    if (!accessCheck.authorized) {
      return NextResponse.json({ error: photoMessages.unauthorized || 'Unauthorized' }, { status: 403 })
    }

    const photos = await prisma.photo.findMany({
      where: { albumId, uploadCompletedAt: { not: null } },
      orderBy: { createdAt: 'asc' },
    })

    const sessionId = accessCheck.shareTokenSessionId || `guest:${Date.now()}`
    const contentToken = await generateAlbumAccessToken(albumId, projectId, request, sessionId)

    return NextResponse.json({
      contentToken,
      photos: photos.map(photo => ({
        id: photo.id,
        fileName: photo.fileName,
        fileSize: photo.fileSize.toString(),
        fileType: photo.fileType,
        width: photo.width,
        height: photo.height,
        hasThumbnail: !!photo.thumbnailPath,
        createdAt: photo.createdAt,
      })),
    })
  } catch (error) {
    logError('Error fetching photos:', error)
    return NextResponse.json(
      { error: photoMessages.failedToFetchPhotos || 'Failed to fetch photos' },
      { status: 500 }
    )
  }
}

// POST /api/projects/[id]/photo-albums/[albumId]/photos - Create photo record for upload (admin only)
export async function POST(
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
    maxRequests: 120,
    message: photoMessages.tooManyUploadRequests || 'Too many upload requests. Please slow down.',
  }, 'photos-create')
  if (rateLimitResult) return rateLimitResult

  try {
    const album = await prisma.photoAlbum.findUnique({
      where: { id: albumId },
      select: { id: true, projectId: true },
    })

    if (!album || album.projectId !== projectId) {
      return NextResponse.json({ error: photoMessages.albumNotFound || 'Album not found' }, { status: 404 })
    }

    const currentUser = await getCurrentUserFromRequest(request)
    if (!currentUser) {
      return NextResponse.json({ error: photoMessages.unauthorized || 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = createPhotoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }
    const { fileName, fileSize, mimeType } = parsed.data

    const photoValidation = validatePhotoFile(fileName, mimeType || 'application/octet-stream')
    if (!photoValidation.valid) {
      return NextResponse.json(
        { error: photoValidation.error || photoMessages.invalidPhotoFile || 'Invalid photo file' },
        { status: 400 }
      )
    }

    const timestamp = Date.now()
    const sanitizedFileName = photoValidation.sanitizedFilename || fileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255)
    const storagePath = `projects/${projectId}/photos/${albumId}/photo-${timestamp}-${sanitizedFileName}`

    const photo = await prisma.photo.create({
      data: {
        albumId,
        fileName: sanitizedFileName,
        fileSize: BigInt(fileSize),
        fileType: mimeType || 'application/octet-stream',
        storagePath,
        uploadedBy: currentUser.id,
        uploadedByName: currentUser.name || currentUser.email,
      },
    })

    return NextResponse.json({ photoId: photo.id })
  } catch (error) {
    logError('Error creating photo:', error)
    return NextResponse.json(
      { error: photoMessages.failedToCreatePhoto || 'Failed to create photo' },
      { status: 500 }
    )
  }
}
