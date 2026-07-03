import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/project-access'
import { rateLimit } from '@/lib/rate-limit'
import { getRedis } from '@/lib/redis'
import { getClientIpAddress } from '@/lib/utils'
import crypto from 'crypto'
import { z } from 'zod'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

const downloadZipTokenSchema = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('selection'),
    albumId: z.string().min(1),
    photoIds: z.array(z.string().min(1)).min(1, 'No photos selected').max(200, 'Too many photos requested'),
  }),
  z.object({
    scope: z.literal('album'),
    albumId: z.string().min(1),
  }),
  z.object({
    scope: z.literal('project'),
  }),
])

/**
 * Generate a temporary download token for photo ZIP downloads
 * (selection, whole album, or whole project).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const photoMessages = messages?.photos || {}

  const { id: projectId } = await params

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: photoMessages.tooManyDownloadRequests || 'Too many download requests. Please slow down.',
  }, `photo-zip-token:${projectId}`)
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()
    const parsed = downloadZipTokenSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, sharePassword: true, authMode: true, allowPhotoDownload: true },
    })

    if (!project) {
      return NextResponse.json({ error: photoMessages.projectNotFound || 'Project not found' }, { status: 404 })
    }

    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword, project.authMode, {
      allowGuest: false,
      requiredPermission: 'download',
    })
    if (!accessCheck.authorized) {
      return NextResponse.json({ error: photoMessages.unauthorized || 'Unauthorized' }, { status: 403 })
    }

    if (!accessCheck.isAdmin && !project.allowPhotoDownload) {
      return NextResponse.json(
        { error: photoMessages.downloadsNotAllowed || 'Photo downloads are not allowed for this project' },
        { status: 403 }
      )
    }

    // Verify the requested scope resolves to at least one completed photo
    if (parsed.data.scope === 'selection') {
      const count = await prisma.photo.count({
        where: {
          id: { in: parsed.data.photoIds },
          albumId: parsed.data.albumId,
          album: { projectId },
          uploadCompletedAt: { not: null },
        },
      })
      if (count === 0) {
        return NextResponse.json({ error: photoMessages.noPhotosFound || 'No photos found' }, { status: 404 })
      }
      if (count !== parsed.data.photoIds.length) {
        return NextResponse.json({ error: photoMessages.somePhotosInvalid || 'Some photos are invalid' }, { status: 400 })
      }
    } else if (parsed.data.scope === 'album') {
      const count = await prisma.photo.count({
        where: {
          albumId: parsed.data.albumId,
          album: { projectId },
          uploadCompletedAt: { not: null },
        },
      })
      if (count === 0) {
        return NextResponse.json({ error: photoMessages.noPhotosFound || 'No photos found' }, { status: 404 })
      }
    } else {
      const count = await prisma.photo.count({
        where: {
          album: { projectId },
          uploadCompletedAt: { not: null },
        },
      })
      if (count === 0) {
        return NextResponse.json({ error: photoMessages.noPhotosFound || 'No photos found' }, { status: 404 })
      }
    }

    const token = crypto.randomBytes(32).toString('base64url')

    const redis = getRedis()
    const sessionId = accessCheck.shareTokenSessionId || (accessCheck.isAdmin ? `admin:${Date.now()}` : `guest:${Date.now()}`)
    const ipAddress = getClientIpAddress(request)
    const userAgentHash = crypto
      .createHash('sha256')
      .update(request.headers.get('user-agent') || 'unknown')
      .digest('hex')

    const tokenData = {
      projectId,
      scope: parsed.data.scope,
      albumId: parsed.data.scope !== 'project' ? parsed.data.albumId : undefined,
      photoIds: parsed.data.scope === 'selection' ? parsed.data.photoIds : undefined,
      sessionId,
      ipAddress,
      userAgentHash,
      createdAt: Date.now(),
      isAdmin: accessCheck.isAdmin || false,
    }

    await redis.setex(
      `photo_zip:${token}`,
      15 * 60, // 15 minutes
      JSON.stringify(tokenData)
    )

    return NextResponse.json({
      url: `/api/content/photos-zip/${token}`,
    })
  } catch (error) {
    logError('Photo ZIP download token generation error:', error)
    return NextResponse.json(
      { error: photoMessages.failedToGenerateDownloadLink || 'Failed to generate download link' },
      { status: 500 }
    )
  }
}
