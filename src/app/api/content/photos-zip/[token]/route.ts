import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { downloadFile, sanitizeFilenameForHeader } from '@/lib/storage'
import { rateLimit } from '@/lib/rate-limit'
import { getRedis, consumeTokenAtomically } from '@/lib/redis'
import { getClientIpAddress } from '@/lib/utils'
import { logSecurityEvent } from '@/lib/video-access'
import { ZipArchive } from 'archiver'
import { Readable } from 'stream'
import crypto from 'crypto'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError, logMessage } from '@/lib/logging'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stream photo ZIP directly to browser (selection / album / whole project).
 * Single-use fingerprint-bound token, mirrors /api/content/zip/[token].
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

    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 30,
      message: photoMessages.tooManyDownloadRequests || 'Too many download requests. Please slow down.',
    }, 'photo-zip-download-ip')

    if (rateLimitResult) {
      await logSecurityEvent({
        type: 'RATE_LIMIT_HIT',
        severity: 'WARNING',
        ipAddress: getClientIpAddress(request),
        details: { limit: 'Photo ZIP download', window: '1 minute' },
        wasBlocked: true,
      })
      return rateLimitResult
    }

    const redis = getRedis()
    const tokenKey = `photo_zip:${token}`
    const rawTokenData = await redis.get(tokenKey)

    if (!rawTokenData) {
      logMessage('[DOWNLOAD] Invalid or expired photo zip download token')
      return NextResponse.json({ error: photoMessages.invalidOrExpiredDownloadLink || 'Invalid or expired download link' }, { status: 403 })
    }

    const tokenData = JSON.parse(rawTokenData)
    const { projectId, scope, albumId, photoIds, sessionId, ipAddress, userAgentHash } = tokenData

    // Bind token usage to the requester fingerprint that generated it
    const requestIp = getClientIpAddress(request)
    const requestUaHash = crypto
      .createHash('sha256')
      .update(request.headers.get('user-agent') || 'unknown')
      .digest('hex')

    if (ipAddress !== requestIp || userAgentHash !== requestUaHash) {
      await logSecurityEvent({
        type: 'TOKEN_SESSION_MISMATCH',
        severity: 'WARNING',
        projectId,
        sessionId,
        ipAddress: requestIp,
        details: { reason: 'photo-zip-token-fingerprint-mismatch' },
        wasBlocked: true,
      })
      return NextResponse.json({ error: photoMessages.accessDenied || 'Access denied' }, { status: 403 })
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, title: true },
    })

    if (!project) {
      return NextResponse.json({ error: photoMessages.accessDenied || 'Access denied' }, { status: 403 })
    }

    // Resolve photos per scope
    const photos = await prisma.photo.findMany({
      where: {
        ...(scope === 'selection' ? { id: { in: photoIds }, albumId } : {}),
        ...(scope === 'album' ? { albumId } : {}),
        album: { projectId },
        uploadCompletedAt: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      include: { album: { select: { id: true, name: true } } },
    })

    if (photos.length === 0) {
      return NextResponse.json({ error: photoMessages.noPhotosFound || 'No photos found' }, { status: 404 })
    }

    // Atomically consume token after all authorization checks pass
    const consumed = await consumeTokenAtomically(redis, tokenKey, rawTokenData)
    if (!consumed) {
      return NextResponse.json({ error: photoMessages.invalidOrExpiredDownloadLink || 'Invalid or expired download link' }, { status: 403 })
    }

    // Photos (JPEG/PNG/WebP) are already compressed — store mode streams faster
    const archive = new ZipArchive({
      store: true,
    })

    archive.on('error', (err) => {
      logError('Photo ZIP archive error:', err)
    })

    // Project scope nests entries per album folder; dedupe duplicate names
    const usedNames = new Set<string>()
    const uniqueEntryName = (name: string): string => {
      if (!usedNames.has(name)) {
        usedNames.add(name)
        return name
      }
      const dot = name.lastIndexOf('.')
      const base = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let counter = 1
      let candidate = `${base}_${counter}${ext}`
      while (usedNames.has(candidate)) {
        counter += 1
        candidate = `${base}_${counter}${ext}`
      }
      usedNames.add(candidate)
      return candidate
    }

    let appendedCount = 0
    for (const photo of photos) {
      try {
        const folder = scope === 'project'
          ? `${photo.album.name.replace(/[/\\:]/g, '_')}/`
          : ''
        const entryName = uniqueEntryName(`${folder}${photo.fileName}`)
        const fileStream = await downloadFile(photo.storagePath)
        archive.append(fileStream, { name: entryName })
        appendedCount += 1
      } catch (error) {
        logError(`Error adding photo ${photo.fileName} to archive:`, error)
        // Continue with other files instead of failing completely
      }
    }

    if (appendedCount === 0) {
      return NextResponse.json({ error: photoMessages.noPhotosFound || 'No photos found' }, { status: 404 })
    }

    void archive.finalize()

    const readableStream = Readable.toWeb(archive as any) as ReadableStream

    const sanitizedProjectTitle = project.title.replace(/[^a-zA-Z0-9._-]/g, '_')
    const albumName = scope !== 'project' && photos[0]?.album?.name
      ? `_${photos[0].album.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      : ''
    const zipFilename = sanitizeFilenameForHeader(
      `${sanitizedProjectTitle}${albumName}_photos.zip`
    )

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    logError('[DOWNLOAD] Photo ZIP download error:', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
