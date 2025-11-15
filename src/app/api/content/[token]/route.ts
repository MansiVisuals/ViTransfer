import { NextRequest, NextResponse } from 'next/server'
import { verifyVideoAccessToken, detectHotlinking, trackVideoAccess, logSecurityEvent, getSecuritySettings, getRedis } from '@/lib/video-access'
import { prisma } from '@/lib/db'
import { createReadStream, existsSync, statSync } from 'fs'
import fs from 'fs'
import { getFilePath, sanitizeFilenameForHeader } from '@/lib/storage'
import { cookies } from 'next/headers'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIpAddress } from '@/lib/utils'
import { getCurrentUserFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Secure Token-Based Video Streaming Endpoint
 * 
 * URL: /api/content/{token}
 * 
 * Security Features:
 * - Cryptographically random tokens (128-bit entropy)
 * - Session-bound access (prevents token sharing)
 * - Time-limited (15 min expiry)
 * - Multi-tier rate limiting
 * - Hotlink detection and blocking
 * - Full analytics tracking
 * - Admin-configurable security settings
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const { searchParams } = new URL(request.url)
    const isDownload = searchParams.get('download') === 'true'

    // Get security settings for rate limits
    const securitySettings = await getSecuritySettings()

    // TIER 1: Per-IP Rate Limiting (Very generous for video streaming with chunking)
    // Video players make MANY rapid HTTP Range requests for buffering/seeking
    const ipRateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: securitySettings.ipRateLimit, // Use global setting
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
    
    // SECURITY: Check authentication - TWO paths:
    // Path 1: Admin with valid JWT (vitransfer_session)
    // Path 2: Regular user with share session

    const currentUser = await getCurrentUserFromRequest(request)
    const isAdmin = currentUser?.role === 'ADMIN'

    const redis = getRedis()
    const tokenKey = `video_access:${token}`
    const rawTokenData = await redis.get(tokenKey)

    if (!rawTokenData) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const preliminaryTokenData = JSON.parse(rawTokenData)

    // Get share session cookie
    const cookieStore = await cookies()
    let sessionId = cookieStore.get('share_session')?.value

    // ADMIN PATH: Admins authenticated via JWT, no share session needed
    if (isAdmin) {
      // Verify token belongs to a real project (security check)
      const project = await prisma.project.findUnique({
        where: { id: preliminaryTokenData.projectId },
        select: { id: true }
      })

      if (!project) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }

      // Admin verified - use special admin session marker for logging
      sessionId = `admin:${currentUser.id}`
    } else {
      // REGULAR USER PATH: Verify share session exists and matches project
      if (!sessionId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 401 })
      }

      // Verify session includes this project in Redis
      const hasAccess = await redis.sismember(`session_projects:${sessionId}`, preliminaryTokenData.projectId)

      if (!hasAccess) {
        // Session doesn't have access to this project - possible attack
        await logSecurityEvent({
          type: 'SESSION_PROJECT_MISMATCH',
          severity: 'WARNING',
          projectId: preliminaryTokenData.projectId,
          sessionId,
          ipAddress: getClientIpAddress(request),
          details: { expectedProject: preliminaryTokenData.projectId }
        })

        return NextResponse.json({ error: 'Access denied' }, { status: 401 })
      }
    }
    
    // TIER 2: Per-Session Rate Limiting (Very generous for video streaming with chunking)
    // Video players make rapid HTTP Range requests when seeking, buffering, or loading multiple videos
    // Typical usage: 5-10 chunks per second during active viewing, more during seeking
    const sessionRateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: securitySettings.sessionRateLimit, // Use global setting
      message: 'Video streaming rate limit exceeded. Please wait a moment.'
    }, `content-stream-session:${sessionId}`)

    if (sessionRateLimitResult) {
      await logSecurityEvent({
        type: 'RATE_LIMIT_HIT',
        severity: 'INFO',
        projectId: preliminaryTokenData.projectId,
        sessionId,
        ipAddress: getClientIpAddress(request),
        details: { limit: 'Session-based', window: '1 minute' },
        wasBlocked: true
      })

      return sessionRateLimitResult
    }
    
    // Now verify token WITH proper session ID validation
    const verifiedToken = await verifyVideoAccessToken(token, request, sessionId)

    if (!verifiedToken) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }
    
    // TIER 3: Hotlink Detection & Blocking
    const hotlinkCheck = await detectHotlinking(
      request,
      sessionId,
      verifiedToken.videoId,
      verifiedToken.projectId
    )
    
    if (hotlinkCheck.isHotlinking) {
      // Check protection mode
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
      } else if (securitySettings.hotlinkProtection === 'LOG_ONLY') {
        // Log but allow (monitoring mode)
      }
      // If DISABLED, do nothing
    }
    
    // Load video and project from database
    const video = await prisma.video.findUnique({
      where: { id: verifiedToken.videoId },
      include: { project: true }
    })
    
    if (!video || video.projectId !== verifiedToken.projectId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 404 })
    }

    // Determine which file to serve based on video approval status
    let filePath: string | null = null

    // Check if THIS SPECIFIC VIDEO is approved (per-video approval)
    if (video.approved) {
      // Approved videos get original file without watermark
      filePath = video.originalStoragePath
    } else {
      // Non-approved videos get watermarked preview (whichever resolution was generated)
      filePath = video.preview1080Path || video.preview720Path
    }

    if (!filePath) {
      return NextResponse.json({ error: 'Access denied' }, { status: 404 })
    }
    
    const fullPath = getFilePath(filePath)
    
    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 404 })
    }
    
    const stat = statSync(fullPath)

    // If download requested, return full file with download headers
    // OPTIMIZATION: Use streaming instead of loading entire file into memory
    if (isDownload) {
      // Use original filename for approved videos, generic name for others
      const rawFilename = video.approved
        ? video.originalFileName
        : `${video.project.title.replace(/[^a-z0-9]/gi, '_')}_${verifiedToken.quality}.mp4`
      const filename = sanitizeFilenameForHeader(rawFilename)

      // Track full file download bandwidth
      await trackVideoAccess({
        videoId: verifiedToken.videoId,
        projectId: verifiedToken.projectId,
        sessionId,
        tokenId: token,
        request,
        quality: verifiedToken.quality,
        bandwidth: stat.size,
        eventType: 'DOWNLOAD_COMPLETE'
      })

      // Stream the file instead of loading into memory (prevents OOM on large files)
      const fileStream = createReadStream(fullPath)

      const readableStream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => controller.enqueue(chunk))
          fileStream.on('end', () => controller.close())
          fileStream.on('error', (err) => controller.error(err))
        },
        cancel() {
          fileStream.destroy()
        },
      })

      return new NextResponse(readableStream, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': stat.size.toString(),
          // Security headers
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-cache',
        },
      })
    }

    // Otherwise handle HTTP Range Requests (for video seeking/buffering)
    // CLOUDFLARE NOTE: Free tier has 100MB response limit, but chunked responses
    // via HTTP Range requests bypass this. Each chunk is a separate response.
    // Video players request small chunks (typically 64KB-2MB), well under limits.
    const range = request.headers.get('range')

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      // Cap chunk size to 10MB for Cloudflare safety (browsers typically request much smaller)
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
      const maxChunkSize = 10 * 1024 * 1024 // 10MB max per chunk
      const end = Math.min(requestedEnd, start + maxChunkSize - 1, stat.size - 1)
      const chunksize = (end - start) + 1

      const fileStream = createReadStream(fullPath, { start, end })

      const readableStream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => controller.enqueue(chunk))
          fileStream.on('end', () => controller.close())
          fileStream.on('error', (err) => controller.error(err))
        },
        cancel() {
          fileStream.destroy()
        },
      })

      return new NextResponse(readableStream, {
        status: 206, // Partial Content
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': 'video/mp4',
          'Cache-Control': 'public, max-age=3600', // 1 hour cache for Cloudflare
          // Security headers
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN', // Allow embedding only on same domain
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          // Cloudflare-specific optimizations
          'CF-Cache-Status': 'DYNAMIC', // Let Cloudflare know this is streamable
        },
      })
    }

    // Full file response (no range request)
    const fileStream = createReadStream(fullPath)

    const readableStream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => controller.enqueue(chunk))
        fileStream.on('end', () => controller.close())
        fileStream.on('error', (err) => controller.error(err))
      },
      cancel() {
        fileStream.destroy()
      },
    })

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600', // 1 hour cache for Cloudflare
        // Security headers
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        // Cloudflare-specific optimizations
        'CF-Cache-Status': 'DYNAMIC', // Let Cloudflare know this is streamable
      },
    })
  } catch (error) {
    await logSecurityEvent({
      type: 'STREAM_ERROR',
      severity: 'CRITICAL',
      ipAddress: getClientIpAddress(request),
      details: { error: error instanceof Error ? error.message : 'Unknown error' }
    })

    return NextResponse.json({ error: 'Failed to stream video' }, { status: 500 })
  }
}
