import { NextRequest, NextResponse } from 'next/server'
import { verifyVideoAccessToken, detectHotlinking, trackVideoAccess, logSecurityEvent, getSecuritySettings } from '@/lib/video-access'
import { getRedis } from '@/lib/redis'
import { prisma } from '@/lib/db'
import { createReadStream, existsSync, statSync } from 'fs'
import fs from 'fs'
import { getFilePath, sanitizeFilenameForHeader } from '@/lib/storage'
import { cookies } from 'next/headers'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIpAddress } from '@/lib/utils'
import { getCurrentUserFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const { searchParams } = new URL(request.url)
    const isDownload = searchParams.get('download') === 'true'

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

    const currentUser = await getCurrentUserFromRequest(request)
    const isAdmin = currentUser?.role === 'ADMIN'

    const redis = getRedis()
    const tokenKey = `video_access:${token}`
    const rawTokenData = await redis.get(tokenKey)

    if (!rawTokenData) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const preliminaryTokenData = JSON.parse(rawTokenData)

    const cookieStore = await cookies()
    let sessionId = cookieStore.get('share_session')?.value

    if (isAdmin) {
      const project = await prisma.project.findUnique({
        where: { id: preliminaryTokenData.projectId },
        select: { id: true }
      })

      if (!project) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }

      // Admins can access any valid token, use token's sessionId if no cookie present
      if (!sessionId) {
        sessionId = preliminaryTokenData.sessionId
      }
    } else {
      if (!sessionId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 401 })
      }

      const hasAccess = await redis.sismember(`session_projects:${sessionId}`, preliminaryTokenData.projectId)

      if (!hasAccess) {
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

    if (!sessionId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 401 })
    }

    const sessionRateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: securitySettings.sessionRateLimit,
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

    let filePath: string | null = null

    if (verifiedToken.quality === 'thumbnail') {
      filePath = video.thumbnailPath
    } else if (video.approved) {
      filePath = video.originalStoragePath
    } else {
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

    if (isDownload && verifiedToken.quality === 'thumbnail') {
      return NextResponse.json({ error: 'Thumbnails cannot be downloaded directly' }, { status: 403 })
    }

    if (isDownload) {
      const rawFilename = video.approved
        ? video.originalFileName
        : `${video.project.title.replace(/[^a-z0-9]/gi, '_')}_${verifiedToken.quality}.mp4`
      const filename = sanitizeFilenameForHeader(rawFilename)

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
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-cache',
        },
      })
    }

    const range = request.headers.get('range')

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
      const maxChunkSize = 10 * 1024 * 1024
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

      // Determine correct Content-Type based on file type
      const contentType = verifiedToken.quality === 'thumbnail' ? 'image/jpeg' : 'video/mp4'

      return new NextResponse(readableStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'CF-Cache-Status': 'DYNAMIC',
        },
      })
    }

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

    // Determine correct Content-Type based on file type
    const contentType = verifiedToken.quality === 'thumbnail' ? 'image/jpeg' : 'video/mp4'

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'CF-Cache-Status': 'DYNAMIC',
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
