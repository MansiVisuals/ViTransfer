import { NextRequest, NextResponse } from 'next/server'
import { verifyVideoAccessToken, detectHotlinking, trackVideoAccess, logSecurityEvent, getSecuritySettings } from '@/lib/video-access'
import { getRedis } from '@/lib/redis'
import { prisma } from '@/lib/db'
import { createReadStream, existsSync, statSync, ReadStream } from 'fs'
import { getFilePath, sanitizeFilenameForHeader } from '@/lib/storage'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIpAddress } from '@/lib/utils'
import { getAuthContext } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STREAM_HIGH_WATER_MARK = 1 * 1024 * 1024 // 1MB stream buffer
const STREAM_CHUNK_SIZE = 4 * 1024 * 1024 // 4MB chunks for smooth scrubbing/streaming
const DOWNLOAD_CHUNK_SIZE = 50 * 1024 * 1024 // 50MB chunks

/**
 * Convert Node.js ReadStream to Web ReadableStream
 */
function createWebReadableStream(fileStream: ReadStream): ReadableStream {
  return new ReadableStream({
    start(controller) {
      fileStream.on('data', (chunk) => controller.enqueue(chunk))
      fileStream.on('end', () => controller.close())
      fileStream.on('error', (err) => controller.error(err))
    },
    cancel() {
      fileStream.destroy()
    },
  })
}

/**
 * Content delivery endpoint - streams video/thumbnail content with security checks
 * Handles both admin and share token authentication with rate limiting and hotlink protection
 * Supports range requests for video streaming and direct downloads
 *
 * @param request - NextRequest with authorization header and optional range header
 * @param params - Route params containing the video access token
 * @returns Video/thumbnail stream with appropriate headers, or error response
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const { searchParams } = new URL(request.url)
    const isDownload = searchParams.get('download') === 'true'
    const assetId = searchParams.get('assetId')

    const securitySettings = await getSecuritySettings()

    const ipRateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: securitySettings.ipRateLimit,
      message: 'Too many requests from your network. Please slow down and try again later.'
    }, 'content-stream-ip')

    if (ipRateLimitResult) {
      await logSecurityEvent({
        type: 'RATE_LIMIT_HIT',
        severity: 'WARNING',
        ipAddress: getClientIpAddress(request),
        details: { limit: 'IP-based', window: '1 minute' },
        wasBlocked: true
      })

      return ipRateLimitResult
    }

    // Get authentication context once
    const authContext = await getAuthContext(request)

    const redis = getRedis()
    const tokenKey = `video_access:${token}`
    const rawTokenData = await redis.get(tokenKey)

    if (!rawTokenData) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const preliminaryTokenData = JSON.parse(rawTokenData)

    // Use token's session ID for all users
    const sessionId = preliminaryTokenData.sessionId

    // Determine if this is an admin request (JWT token OR admin session ID)
    const isAdminRequest = authContext.isAdmin || sessionId?.startsWith('admin:')

    // For admin users, verify they have access to the project
    if (isAdminRequest) {
      const project = await prisma.project.findUnique({
        where: { id: preliminaryTokenData.projectId },
        select: { id: true }
      })

      if (!project) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 401 })
    }

    // Session-based rate limiting using lightweight INCR to avoid heavy payloads per chunk
    const sessionCounterKey = `content-session-count:${sessionId}`
    const sessionCount = await redis.incr(sessionCounterKey)
    if (sessionCount === 1) {
      await redis.expire(sessionCounterKey, 60)
    }
    if (sessionCount > securitySettings.sessionRateLimit) {
      await logSecurityEvent({
        type: 'RATE_LIMIT_HIT',
        severity: 'INFO',
        projectId: preliminaryTokenData.projectId,
        sessionId,
        ipAddress: getClientIpAddress(request),
        details: { limit: 'Session-based', window: '1 minute' },
        wasBlocked: true
      })

      return NextResponse.json({
        error: 'Video streaming rate limit exceeded. Please wait a moment.'
      }, { status: 429, headers: { 'Retry-After': '60' } })
    }

    const verifiedToken = await verifyVideoAccessToken(token, request, sessionId)

    if (!verifiedToken) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const hotlinkCheck = await detectHotlinking(
      request,
      sessionId,
      verifiedToken.videoId,
      verifiedToken.projectId
    )

    if (hotlinkCheck.isHotlinking) {
      if (securitySettings.hotlinkProtection === 'BLOCK_STRICT') {
        await logSecurityEvent({
          type: 'HOTLINK_BLOCKED',
          severity: hotlinkCheck.severity || 'WARNING',
          projectId: verifiedToken.projectId,
          videoId: verifiedToken.videoId,
          sessionId,
          ipAddress: getClientIpAddress(request),
          referer: request.headers.get('referer') || undefined,
          details: { reason: hotlinkCheck.reason },
          wasBlocked: true
        })
        
        return NextResponse.json({
          error: 'Access denied'
        }, { status: 403 })
      }
    }

    const video = await prisma.video.findUnique({
      where: { id: verifiedToken.videoId },
      include: { project: true }
    })

    if (!video || video.projectId !== verifiedToken.projectId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 404 })
    }

    const originalPath = video.originalStoragePath
    let filePath: string | null = null
    let filename: string | null = null
    let contentType = 'video/mp4'

    // Handle asset download
    if (assetId && isDownload) {
      const asset = await prisma.videoAsset.findUnique({
        where: { id: assetId }
      })

      if (!asset || asset.videoId !== video.id) {
        return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
      }

      // Check permissions (skip for admins)
      if (!isAdminRequest) {
        if (!video.project.allowAssetDownload) {
          return NextResponse.json({ error: 'Asset downloads not allowed' }, { status: 403 })
        }

        if (!video.approved) {
          return NextResponse.json({ error: 'Assets only available for approved videos' }, { status: 403 })
        }
      }

      filePath = asset.storagePath
      filename = asset.fileName
      contentType = asset.fileType
    } else {
      // Handle video download/stream
      if (verifiedToken.quality === 'thumbnail') {
        filePath = video.thumbnailPath
      } else if (isDownload && isAdminRequest && originalPath) {
        // Admin downloads should always use the original file, even before approval
        filePath = originalPath
      } else if (video.approved && originalPath) {
        filePath = originalPath
      } else {
        filePath = video.preview1080Path || video.preview720Path
      }
    }

    if (!filePath) {
      return NextResponse.json({ error: 'Access denied' }, { status: 404 })
    }
    
    const fullPath = getFilePath(filePath)
    
    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 404 })
    }

    const stat = statSync(fullPath)

    if (isDownload && verifiedToken.quality === 'thumbnail') {
      return NextResponse.json({ error: 'Thumbnails cannot be downloaded directly' }, { status: 403 })
    }

    const range = request.headers.get('range')

    const isThumbnail = verifiedToken.quality === 'thumbnail'
    const cacheControl = isThumbnail
      ? 'private, no-store, must-revalidate'
      : 'public, max-age=3600'

    if (isDownload) {
      // Use asset filename if available, otherwise generate from video info
      const rawFilename = filename || (video.approved
        ? video.originalFileName
        : `${video.project.title.replace(/[^a-z0-9]/gi, '_')}_${verifiedToken.quality}.mp4`)
      const sanitizedFilename = sanitizeFilenameForHeader(rawFilename)

      // For non-asset streams, determine Content-Type based on quality
      if (!assetId) {
        contentType = isThumbnail ? 'image/jpeg' : 'video/mp4'
      }

      const trackDownloadOnce = async () => {
        if (!isAdminRequest) {
          await trackVideoAccess({
            videoId: verifiedToken.videoId,
            projectId: verifiedToken.projectId,
            sessionId,
            tokenId: token,
            request,
            quality: verifiedToken.quality,
            bandwidth: stat.size,
            eventType: 'DOWNLOAD_COMPLETE',
            assetId: assetId || undefined,
          }).catch(() => {})
        }
      }

      // If no Range header, stream entire file with 200 so downloads aren't truncated
      if (!range) {
        await trackDownloadOnce()

        const fileStream = createReadStream(fullPath, { highWaterMark: STREAM_HIGH_WATER_MARK })
        const readableStream = createWebReadableStream(fileStream)

        return new NextResponse(readableStream, {
          headers: {
            'Content-Type': contentType,
            'Content-Length': stat.size.toString(),
            'Accept-Ranges': 'bytes',
            'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
            'Cache-Control': 'private, no-cache',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'SAMEORIGIN',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
          },
        })
      }

      // If client requested range, serve in 16MB chunks to keep UI responsive
      const rawRange = range || 'bytes=0-'
      const parts = rawRange.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : start + DOWNLOAD_CHUNK_SIZE - 1
      const end = Math.min(requestedEnd, start + DOWNLOAD_CHUNK_SIZE - 1, stat.size - 1)
      const chunksize = (end - start) + 1

      if (start === 0) {
        await trackDownloadOnce()
      }

      const fileStream = createReadStream(fullPath, { start, end, highWaterMark: STREAM_HIGH_WATER_MARK })
      const readableStream = createWebReadableStream(fileStream)

      return new NextResponse(readableStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
          'Cache-Control': 'private, no-cache',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      })
    }

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : start + STREAM_CHUNK_SIZE - 1
      // Cap chunk size so scrubbing doesn't request the entire remainder of the file
      const end = Math.min(requestedEnd, start + STREAM_CHUNK_SIZE - 1, stat.size - 1)
      const chunksize = (end - start) + 1

      const fileStream = createReadStream(fullPath, { start, end, highWaterMark: STREAM_HIGH_WATER_MARK })
      const readableStream = createWebReadableStream(fileStream)

      // For non-asset streams, determine Content-Type based on quality
      if (!assetId) {
        contentType = isThumbnail ? 'image/jpeg' : 'video/mp4'
      }

      return new NextResponse(readableStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'CF-Cache-Status': 'DYNAMIC',
        },
      })
    }

    const fileStream = createReadStream(fullPath, { highWaterMark: STREAM_HIGH_WATER_MARK })
    const readableStream = createWebReadableStream(fileStream)

    // For non-asset streams, determine Content-Type based on quality
    if (!assetId) {
      contentType = isThumbnail ? 'image/jpeg' : 'video/mp4'
    }

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'CF-Cache-Status': 'DYNAMIC',
      },
    })
  } catch (error) {
    // Stream errors are technical issues, not security events
    console.error('[STREAM] Video streaming error:', error)

    return NextResponse.json({ error: 'Failed to stream video' }, { status: 500 })
  }
}
