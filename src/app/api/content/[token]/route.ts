import { NextRequest, NextResponse } from 'next/server'
import { verifyVideoAccessToken, detectHotlinking, trackVideoAccess, logSecurityEvent, getSecuritySettings } from '@/lib/video-access'
import { getRedis } from '@/lib/redis'
import { prisma } from '@/lib/db'
import { createReadStream, existsSync, statSync, ReadStream } from 'fs'
import { getFilePath, sanitizeFilenameForHeader } from '@/lib/storage'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIpAddress } from '@/lib/utils'
import { getAuthContext } from '@/lib/auth'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'
import {
  DOWNLOAD_CHUNK_SIZE_BYTES,
  STREAM_CHUNK_SIZE_BYTES,
  STREAM_HIGH_WATER_MARK_BYTES,
  parseBoundedRangeHeader,
} from '@/lib/transfer-tuning'


export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CONTENT_SESSION_WINDOW_SECONDS = 60


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
    const locale = await getConfiguredLocale()
    const messages = await loadLocaleMessages(locale)
    const shareMessages = messages?.share || {}

    const { token } = await params
    const { searchParams } = new URL(request.url)
    const isDownload = searchParams.get('download') === 'true'
    const assetId = searchParams.get('assetId')

    const securitySettings = await getSecuritySettings()

    const ipRateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: securitySettings.ipRateLimit,
      message: shareMessages.tooManyNetworkRequests || 'Too many requests from your network. Please slow down and try again later.'
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
  return NextResponse.json({ error: shareMessages.accessDenied || 'Access denied' }, { status: 403 })
    }

    const preliminaryTokenData = JSON.parse(rawTokenData)

    // Use token's session ID for all users
    const sessionId = preliminaryTokenData.sessionId

    // Determine if this is an admin request (JWT token OR explicit isAdmin flag in token data)
    const isAdminRequest = authContext.isAdmin || preliminaryTokenData.isAdmin === true

    // For admin users, verify they have access to the project
    if (isAdminRequest) {
      const project = await prisma.project.findUnique({
        where: { id: preliminaryTokenData.projectId },
        select: { id: true }
      })

      if (!project) {
  return NextResponse.json({ error: shareMessages.accessDenied || 'Access denied' }, { status: 403 })
      }
    }

    if (!sessionId) {
  return NextResponse.json({ error: shareMessages.accessDenied || 'Access denied' }, { status: 401 })
    }

    // Session-based content rate limiting.
    // Range requests (video scrubbing/seeking) are normal browser behaviour and are
    // already guarded by the IP rate limit, hotlink detection, and the per-video
    // frequency counter in detectHotlinking (>3000 req / 5 min). Only count
    // non-range requests (initial video loads, downloads, thumbnails) against the
    // session budget so that scrubbing never triggers a 429.
    const rangeHeader = request.headers.get('range')
    const isRangeRequest = !!rangeHeader

    if (!isRangeRequest) {
      const sessionCounterKey = `content-session-count:${sessionId}`
      const sessionCount = await redis.incr(sessionCounterKey)
      if (sessionCount === 1) {
        await redis.expire(sessionCounterKey, CONTENT_SESSION_WINDOW_SECONDS)
      }

      const sessionRateLimit = isAdminRequest
        ? securitySettings.sessionRateLimit
        : securitySettings.shareSessionRateLimit

      if (sessionCount > sessionRateLimit) {
        await logSecurityEvent({
          type: 'RATE_LIMIT_HIT',
          severity: 'INFO',
          projectId: preliminaryTokenData.projectId,
          sessionId,
          ipAddress: getClientIpAddress(request),
          details: {
            limit: isAdminRequest ? 'Admin session-based' : 'Share session-based',
            window: '1 minute'
          },
          wasBlocked: true
        })

        return NextResponse.json({
          error: shareMessages.videoStreamingRateLimitExceeded || 'Video streaming rate limit exceeded. Please wait a moment.'
        }, { status: 429, headers: { 'Retry-After': String(CONTENT_SESSION_WINDOW_SECONDS) } })
      }
    }

    const verifiedToken = await verifyVideoAccessToken(token, request, sessionId)

    if (!verifiedToken) {
  return NextResponse.json({ error: shareMessages.accessDenied || 'Access denied' }, { status: 403 })
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
          error: shareMessages.accessDenied || 'Access denied'
        }, { status: 403 })
      }
    }

    const video = await prisma.video.findUnique({
      where: { id: verifiedToken.videoId },
      include: { project: true }
    })

    if (!video || video.projectId !== verifiedToken.projectId) {
  return NextResponse.json({ error: shareMessages.accessDenied || 'Access denied' }, { status: 404 })
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
  return NextResponse.json({ error: shareMessages.assetNotFound || 'Asset not found' }, { status: 404 })
      }

      // Check permissions (skip for admins and client-uploaded comment attachments)
      if (!isAdminRequest && asset.uploadedBy !== 'client') {
        if (!video.project.allowAssetDownload) {
          return NextResponse.json({ error: shareMessages.assetDownloadsNotAllowed || 'Asset downloads not allowed' }, { status: 403 })
        }

        if (!video.approved) {
          return NextResponse.json({ error: shareMessages.assetsOnlyAvailableForApprovedVideos || 'Assets only available for approved videos' }, { status: 403 })
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
        // Check if project prefers preview playback after approval (for streaming, not downloads)
        if (!isDownload && video.project.usePreviewForApprovedPlayback) {
          // Prefer clean preview if available, fall back to watermarked preview, then original
          const cleanPath = video.cleanPreview1080Path || video.cleanPreview720Path
          const watermarkedPath = video.preview1080Path || video.preview720Path
          filePath = cleanPath || watermarkedPath || originalPath
        } else {
          filePath = originalPath
        }
      } else {
        filePath = video.preview1080Path || video.preview720Path
      }
    }

    if (!filePath) {
  return NextResponse.json({ error: shareMessages.accessDenied || 'Access denied' }, { status: 404 })
    }
    
    const fullPath = getFilePath(filePath)
    
    if (!existsSync(fullPath)) {
  return NextResponse.json({ error: shareMessages.accessDenied || 'Access denied' }, { status: 404 })
    }

    const stat = statSync(fullPath)

    if (isDownload && verifiedToken.quality === 'thumbnail') {
  return NextResponse.json({ error: shareMessages.thumbnailsCannotBeDownloaded || 'Thumbnails cannot be downloaded directly' }, { status: 403 })
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

        const fileStream = createReadStream(fullPath, { highWaterMark: STREAM_HIGH_WATER_MARK_BYTES })
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
      const parsedRange = parseBoundedRangeHeader(range || 'bytes=0-', stat.size, DOWNLOAD_CHUNK_SIZE_BYTES)
      if (!parsedRange) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${stat.size}` },
        })
      }
      const { start, end } = parsedRange
      const chunksize = (end - start) + 1

      if (start === 0) {
        await trackDownloadOnce()
      }

      const fileStream = createReadStream(fullPath, { start, end, highWaterMark: STREAM_HIGH_WATER_MARK_BYTES })
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
      const parsedRange = parseBoundedRangeHeader(range, stat.size, STREAM_CHUNK_SIZE_BYTES)
      if (!parsedRange) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${stat.size}` },
        })
      }
      const { start, end } = parsedRange
      const chunksize = (end - start) + 1

      const fileStream = createReadStream(fullPath, { start, end, highWaterMark: STREAM_HIGH_WATER_MARK_BYTES })
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

    const fileStream = createReadStream(fullPath, { highWaterMark: STREAM_HIGH_WATER_MARK_BYTES })
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
    logError('[STREAM] Video streaming error:', error)

    const locale = await getConfiguredLocale().catch(() => 'en')
    const messages = await loadLocaleMessages(locale).catch(() => null)
    const shareMessages = messages?.share || {}
    return NextResponse.json({ error: shareMessages.failedToStreamVideo || 'Failed to stream video' }, { status: 500 })
  }
}
