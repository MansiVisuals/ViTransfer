import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { downloadFile, sanitizeFilenameForHeader } from '@/lib/storage'
import { rateLimit } from '@/lib/rate-limit'
import { getRedis } from '@/lib/redis'
import { getClientIpAddress } from '@/lib/utils'
import { logSecurityEvent } from '@/lib/video-access'
import archiver from 'archiver'
import { Readable } from 'stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

    // Verify token
    const redis = getRedis()
    const tokenKey = `zip_download:${token}`
    const rawTokenData = await redis.get(tokenKey)

    if (!rawTokenData) {
      // Invalid/expired download token - not a security event, just expired link
      console.warn('[DOWNLOAD] Invalid or expired zip download token')
      return NextResponse.json({ error: 'Invalid or expired download link' }, { status: 403 })
    }

    const tokenData = JSON.parse(rawTokenData)
    const { videoId, projectId, assetIds } = tokenData

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

    // Create ZIP archive with streaming (no memory buffer)
    const archive = archiver('zip', {
      zlib: { level: 6 }, // Compression level (0-9)
    })

    // Handle archive errors
    archive.on('error', (err) => {
      console.error('ZIP archive error:', err)
      throw err
    })

    // Add files to archive
    for (const asset of assets) {
      try {
        const fileStream = await downloadFile(asset.storagePath)
        archive.append(fileStream, { name: asset.fileName })
      } catch (error) {
        console.error(`Error adding file ${asset.fileName} to archive:`, error)
        // Continue with other files instead of failing completely
      }
    }

    // Finalize archive (must be called before streaming)
    archive.finalize()

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
