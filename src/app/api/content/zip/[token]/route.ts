import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { downloadFile, sanitizeFilenameForHeader } from '@/lib/storage'
import { rateLimit } from '@/lib/rate-limit'
import { getRedis } from '@/lib/redis'
import { getClientIpAddress } from '@/lib/utils'
import { logSecurityEvent, trackVideoAccess } from '@/lib/video-access'
import archiver from 'archiver'
import { Readable } from 'stream'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function consumeTokenAtomically(
  redis: ReturnType<typeof getRedis>,
  tokenKey: string,
  expectedValue: string
): Promise<boolean> {
  const result = await redis.eval(
    `
      local current = redis.call('GET', KEYS[1])
      if not current then
        return 0
      end
      if current ~= ARGV[1] then
        return -1
      end
      redis.call('DEL', KEYS[1])
      return 1
    `,
    1,
    tokenKey,
    expectedValue
  )

  return Number(result) === 1
}

/**
 * Stream ZIP file directly to browser - NO memory loading
 * Token-based authentication with automatic expiry
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    // Rate limit by IP
    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 30,
      message: 'Too many download requests. Please slow down.',
    }, 'zip-download-ip')

    if (rateLimitResult) {
      await logSecurityEvent({
        type: 'RATE_LIMIT_HIT',
        severity: 'WARNING',
        ipAddress: getClientIpAddress(request),
        details: { limit: 'ZIP download', window: '1 minute' },
        wasBlocked: true,
      })
      return rateLimitResult
    }

    // Verify token (single-use token consumed atomically after validation)
    const redis = getRedis()
    const tokenKey = `zip_download:${token}`
    const rawTokenData = await redis.get(tokenKey)

    if (!rawTokenData) {
      // Invalid/expired download token - not a security event, just expired link
      console.warn('[DOWNLOAD] Invalid or expired zip download token')
      return NextResponse.json({ error: 'Invalid or expired download link' }, { status: 403 })
    }

    const tokenData = JSON.parse(rawTokenData)
    const { videoId, projectId, assetIds, sessionId, ipAddress, userAgentHash } = tokenData

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
        videoId,
        sessionId,
        ipAddress: requestIp,
        details: { reason: 'zip-token-fingerprint-mismatch' },
        wasBlocked: true,
      })
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get video with project
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { project: true },
    })

    if (!video || video.projectId !== projectId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get all requested assets
    const assets = await prisma.videoAsset.findMany({
      where: {
        id: { in: assetIds },
        videoId,
      },
    })

    if (assets.length === 0) {
      return NextResponse.json({ error: 'No valid assets found' }, { status: 404 })
    }

    // Atomically consume token after all authorization checks pass.
    // This prevents invalid requesters from burning the token and avoids replay races.
    const consumed = await consumeTokenAtomically(redis, tokenKey, rawTokenData)
    if (!consumed) {
      return NextResponse.json({ error: 'Invalid or expired download link' }, { status: 403 })
    }

    // Track download analytics (sessionId check handles admin filtering automatically)
    if (sessionId) {
      await trackVideoAccess({
        videoId,
        projectId,
        sessionId,
        request,
        quality: 'assets',
        eventType: 'DOWNLOAD_COMPLETE',
        assetIds: assetIds,
      }).catch(() => {})
    }

    // Create ZIP archive with streaming (no memory buffer)
    const archive = archiver('zip', {
      zlib: { level: 6 }, // Compression level (0-9)
    })

    archive.on('error', (err) => {
      console.error('ZIP archive error:', err)
    })

    // Add files to archive
    let appendedCount = 0
    for (const asset of assets) {
      try {
        const fileStream = await downloadFile(asset.storagePath)
        archive.append(fileStream, { name: asset.fileName })
        appendedCount += 1
      } catch (error) {
        console.error(`Error adding file ${asset.fileName} to archive:`, error)
        // Continue with other files instead of failing completely
      }
    }

    if (appendedCount === 0) {
      return NextResponse.json({ error: 'No downloadable assets available' }, { status: 404 })
    }

    // Finalize archive (must be called before streaming)
    void archive.finalize()

    // Convert Node.js readable stream to Web ReadableStream
    const readableStream = Readable.toWeb(archive as any) as ReadableStream

    // Generate filename
    const sanitizedVideoName = video.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const zipFilename = sanitizeFilenameForHeader(
      `${sanitizedVideoName}_${video.versionLabel}_assets.zip`
    )

    // Stream ZIP directly to browser (no memory loading)
    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipFilename}"`,
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    // Download errors are technical issues, not security events
    console.error('[DOWNLOAD] ZIP download error:', error)
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}
