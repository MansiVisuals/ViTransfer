import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { downloadFile, sanitizeFilenameForHeader } from '@/lib/storage'
import { rateLimit } from '@/lib/rate-limit'
import { getRedis, consumeTokenAtomically } from '@/lib/redis'
import { getClientIpAddress } from '@/lib/utils'
import { logSecurityEvent, trackVideoAccess } from '@/lib/video-access'
import archiver from 'archiver'
import { Readable } from 'stream'
import crypto from 'crypto'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError, logMessage } from '@/lib/logging'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stream ZIP of all approved videos directly to browser.
 * Token-based authentication with automatic expiry.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const locale = await getConfiguredLocale()
    const messages = await loadLocaleMessages(locale)
    const shareMessages = messages?.share || {}

    const { token } = await params

    // Rate limit by IP
    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 10,
      message: shareMessages.tooManyRequestsGeneric || 'Too many download requests. Please slow down.',
    }, 'bulk-zip-download-ip')

    if (rateLimitResult) {
      await logSecurityEvent({
        type: 'RATE_LIMIT_HIT',
        severity: 'WARNING',
        ipAddress: getClientIpAddress(request),
        details: { limit: 'Bulk ZIP download', window: '1 minute' },
        wasBlocked: true,
      })
      return rateLimitResult
    }

    // Verify token
    const redis = getRedis()
    const tokenKey = `bulk_download:${token}`
    const rawTokenData = await redis.get(tokenKey)

    if (!rawTokenData) {
      logMessage('[DOWNLOAD] Invalid or expired bulk download token')
      return NextResponse.json({ error: shareMessages.invalidOrExpiredDownloadLink || 'Invalid or expired download link' }, { status: 403 })
    }

    const tokenData = JSON.parse(rawTokenData)
    const { projectId, projectTitle, videoIds, sessionId, ipAddress, userAgentHash } = tokenData

    // Bind token to requester fingerprint
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
        details: { reason: 'bulk-zip-token-fingerprint-mismatch' },
        wasBlocked: true,
      })
      return NextResponse.json({ error: shareMessages.accessDenied || 'Access denied' }, { status: 403 })
    }

    // Fetch approved videos
    const videos = await prisma.video.findMany({
      where: {
        id: { in: videoIds },
        projectId,
        approved: true,
      },
      select: {
        id: true,
        name: true,
        versionLabel: true,
        originalFileName: true,
        originalStoragePath: true,
      },
    })

    if (videos.length === 0) {
      return NextResponse.json({ error: shareMessages.noApprovedVideos || 'No approved videos found' }, { status: 404 })
    }

    // Atomically consume token
    const consumed = await consumeTokenAtomically(redis, tokenKey, rawTokenData)
    if (!consumed) {
      return NextResponse.json({ error: shareMessages.invalidOrExpiredDownloadLink || 'Invalid or expired download link' }, { status: 403 })
    }

    // Track download analytics
    if (sessionId) {
      for (const video of videos) {
        await trackVideoAccess({
          videoId: video.id,
          projectId,
          sessionId,
          request,
          quality: 'original',
          eventType: 'DOWNLOAD_COMPLETE',
          isAdmin: tokenData.isAdmin === true,
        }).catch(() => {})
      }
    }

    // Create ZIP archive with streaming
    const archive = archiver('zip', {
      zlib: { level: 6 },
    })

    archive.on('error', (err) => {
      logError('Bulk ZIP archive error:', err)
    })

    // Add video files to archive
    let appendedCount = 0
    for (const video of videos) {
      try {
        const ext = video.originalFileName?.match(/\.[^.]+$/)?.[0] || '.mp4'
        const fileName = `${video.name}_${video.versionLabel}${ext}`
        const fileStream = await downloadFile(video.originalStoragePath)
        archive.append(fileStream, { name: fileName })
        appendedCount += 1
      } catch (error) {
        logError(`Error adding video ${video.name} to bulk archive:`, error)
      }
    }

    if (appendedCount === 0) {
      return NextResponse.json({ error: shareMessages.downloadFailed || 'No downloadable videos available' }, { status: 404 })
    }

    void archive.finalize()

    const readableStream = Readable.toWeb(archive as any) as ReadableStream

    const sanitizedProjectTitle = (projectTitle || 'project').replace(/[^a-zA-Z0-9._-]/g, '_')
    const zipFilename = sanitizeFilenameForHeader(
      `${sanitizedProjectTitle}_all_videos.zip`
    )

    logMessage(`[DOWNLOAD] Bulk ZIP download: ${appendedCount} videos for project ${projectId}`)

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    logError('[DOWNLOAD] Bulk ZIP download error:', error)
    const locale = await getConfiguredLocale().catch(() => 'en')
    const messages = await loadLocaleMessages(locale).catch(() => null)
    const shareMessages = messages?.share || {}
    return NextResponse.json({ error: shareMessages.downloadFailed || 'Download failed' }, { status: 500 })
  }
}
