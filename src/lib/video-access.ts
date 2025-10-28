import crypto from 'crypto'
import IORedis from 'ioredis'
import { NextRequest } from 'next/server'
import { prisma } from './db'

/**
 * Video Access Token System
 * 
 * Provides secure, time-limited, session-bound access to videos
 * with full analytics tracking and hotlink detection
 */

let redis: IORedis | null = null

export function getRedis(): IORedis {
  if (redis) return redis
  
  redis = new IORedis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  })
  
  redis.on('error', (error) => {
    console.error('Redis error (video access):', error.message)
  })
  
  return redis
}

interface VideoAccessToken {
  videoId: string
  projectId: string
  quality: string
  sessionId: string
  ipAddress: string
  createdAt: number
}

/**
 * Generate or retrieve cached video access token
 * Uses Redis caching to avoid regenerating tokens for same session+video+quality
 * Token is stored in Redis with TTL and contains metadata
 */
export async function generateVideoAccessToken(
  videoId: string,
  projectId: string,
  quality: string,
  request: NextRequest,
  sessionId: string
): Promise<string> {
  const redis = getRedis()

  // Check if we already have a valid token for this session+video+quality combo
  const cacheKey = `video_token_cache:${sessionId}:${videoId}:${quality}`
  const cachedToken = await redis.get(cacheKey)

  if (cachedToken) {
    // Verify the cached token still exists and is valid
    const tokenData = await redis.get(`video_access:${cachedToken}`)
    if (tokenData) {
      return cachedToken
    }
  }

  // Generate new cryptographically secure random token (128 bits of entropy)
  const token = crypto.randomBytes(16).toString('base64url')

  // Get IP address
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'

  const tokenData: VideoAccessToken = {
    videoId,
    projectId,
    quality,
    sessionId,
    ipAddress,
    createdAt: Date.now(),
  }

  // Store token in Redis with 15 minute TTL
  const ttlSeconds = 15 * 60
  await redis.setex(
    `video_access:${token}`,
    ttlSeconds,
    JSON.stringify(tokenData)
  )

  // Cache the token reference for this session+video+quality (same TTL)
  await redis.setex(cacheKey, ttlSeconds, token)

  return token
}

/**
 * Verify and retrieve a video access token
 * Performs session validation and security checks
 */
export async function verifyVideoAccessToken(
  token: string,
  request: NextRequest,
  sessionId: string
): Promise<VideoAccessToken | null> {
  const redis = getRedis()
  
  const key = `video_access:${token}`
  const data = await redis.get(key)

  if (!data) {
    return null
  }
  
  const tokenData: VideoAccessToken = JSON.parse(data)
  
  // Verify session matches (prevent token sharing)
  if (tokenData.sessionId !== sessionId) {
    // Log security event
    await logSecurityEvent({
      type: 'TOKEN_SESSION_MISMATCH',
      severity: 'WARNING',
      projectId: tokenData.projectId,
      videoId: tokenData.videoId,
      sessionId,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      details: { expectedSession: tokenData.sessionId }
    })

    return null
  }
  
  return tokenData
}

/**
 * Detect potential hotlinking or suspicious activity
 * Returns detection result with reason and severity
 */
export async function detectHotlinking(
  request: NextRequest,
  sessionId: string,
  videoId: string,
  projectId: string
): Promise<{ isHotlinking: boolean; reason?: string; severity?: string }> {
  const redis = getRedis()
  
  const referer = request.headers.get('referer') || request.headers.get('origin')
  const host = request.headers.get('host')
  
  // Check 1: External referer (hotlinking)
  if (referer && host) {
    try {
      const refererUrl = new URL(referer)
      const refererHost = refererUrl.hostname
      
      // If referer doesn't match our domain
      if (host && !refererHost.includes(host) && !host.includes(refererHost)) {
        // Check if domain is blocked
        const blockedDomains = await getBlockedDomains()
        if (blockedDomains.some(domain => refererHost.includes(domain))) {
          return {
            isHotlinking: true,
            reason: `Blocked domain: ${refererHost}`,
            severity: 'CRITICAL'
          }
        }
        
        // Log security event
        await logSecurityEvent({
          type: 'HOTLINK_DETECTED',
          severity: 'WARNING',
          projectId,
          videoId,
          sessionId,
          ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
          referer,
          details: { refererHost }
        })
        
        return {
          isHotlinking: true,
          reason: `External referer: ${refererHost}`,
          severity: 'WARNING'
        }
      }
    } catch (error) {
      // Invalid referer URL, ignore
    }
  }
  
  // Check 2: High frequency access (potential scraping)
  // Note: Video streaming with chunking generates MANY requests (5-10/sec during active viewing)
  // Increased threshold to avoid false positives during normal video playback
  const freqKey = `video_freq:${sessionId}:${videoId}`
  const count = await redis.incr(freqKey)
  await redis.expire(freqKey, 300) // 5 minutes

  // Allow up to 3000 requests per 5 minutes (10/sec sustained)
  // This accommodates video seeking, multiple quality switches, and active viewing
  if (count > 3000) {
    // Log security event every 500 requests
    if (count % 500 === 0) {
      await logSecurityEvent({
        type: 'SUSPICIOUS_ACTIVITY',
        severity: 'WARNING',
        projectId,
        videoId,
        sessionId,
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
        details: { requestCount: count, window: '5min' }
      })
    }

    return {
      isHotlinking: true,
      reason: `High frequency: ${count} requests in 5 min`,
      severity: 'WARNING'
    }
  }
  
  // Check 3: Blocked IP
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   request.headers.get('x-real-ip') ||
                   'unknown'
  
  const blockedIPs = await getBlockedIPs()
  if (blockedIPs.includes(ipAddress)) {
    await logSecurityEvent({
      type: 'BLOCKED_IP_ATTEMPT',
      severity: 'CRITICAL',
      projectId,
      videoId,
      sessionId,
      ipAddress,
      details: { reason: 'IP in blocklist' }
    })

    return {
      isHotlinking: true,
      reason: `Blocked IP: ${ipAddress}`,
      severity: 'CRITICAL'
    }
  }
  
  return { isHotlinking: false }
}

/**
 * Track video analytics - simplified for video review platform
 * Only tracks: PAGE_VISIT (when non-admin views project) and DOWNLOAD_COMPLETE (when download finishes)
 */
export async function trackVideoAccess(params: {
  videoId: string
  projectId: string
  sessionId: string
  tokenId?: string
  request: NextRequest
  quality: string
  bandwidth?: number
  eventType: 'PAGE_VISIT' | 'DOWNLOAD_COMPLETE' // Explicit event types only
}) {
  const { videoId, projectId, bandwidth, eventType } = params

  // Get settings to check if analytics is enabled
  const settings = await prisma.securitySettings.findUnique({
    where: { id: 'default' }
  })

  if (!settings?.trackAnalytics) {
    return // Analytics disabled
  }

  // Store simplified analytics
  await prisma.videoAnalytics.create({
    data: {
      videoId,
      projectId,
      eventType,
    }
  })
}

/**
 * Log security event to database
 */
export async function logSecurityEvent(params: {
  type: string
  severity: string
  projectId?: string
  videoId?: string
  sessionId?: string
  ipAddress?: string
  referer?: string
  details?: any
  wasBlocked?: boolean
}) {
  try {
    // Check if security logging is enabled
    const settings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
      select: { trackSecurityLogs: true }
    })

    if (!settings?.trackSecurityLogs) {
      return // Security logging disabled
    }

    await prisma.securityEvent.create({
      data: {
        type: params.type,
        severity: params.severity,
        projectId: params.projectId,
        videoId: params.videoId,
        sessionId: params.sessionId,
        ipAddress: params.ipAddress,
        referer: params.referer,
        details: params.details,
        wasBlocked: params.wasBlocked || false,
      }
    })

    // Also store in Redis for real-time monitoring (last 1000 events)
    const redis = getRedis()
    await redis.lpush('security:events:recent', JSON.stringify({
      ...params,
      timestamp: new Date().toISOString()
    }))
    await redis.ltrim('security:events:recent', 0, 999) // Keep last 1000

    // Send alert if configured
    await sendSecurityAlert(params)
  } catch (error) {
    console.error('[SECURITY_EVENT] Failed to log:', error)
  }
}

/**
 * Get global security settings
 */
export async function getSecuritySettings() {
  const settings = await prisma.securitySettings.findUnique({
    where: { id: 'default' }
  })

  return {
    hotlinkProtection: settings?.hotlinkProtection || 'LOG_ONLY',
    ipRateLimit: settings?.ipRateLimit || 1000,
    sessionRateLimit: settings?.sessionRateLimit || 600,
    trackSecurityLogs: settings?.trackSecurityLogs ?? true,
  }
}

/**
 * Get blocked IPs from settings (removed - handled at network level)
 */
async function getBlockedIPs(): Promise<string[]> {
  return []
}

/**
 * Get blocked domains from settings (removed - handled at network level)
 */
async function getBlockedDomains(): Promise<string[]> {
  return []
}

/**
 * Send security alert email if configured
 * Simplified - alerts removed from settings
 */
async function sendSecurityAlert(event: {
  type: string
  severity: string
  projectId?: string
  ipAddress?: string
  referer?: string
}) {
  // Alert functionality removed for simplicity
  // You can re-enable by adding alertEmail to SecuritySettings
  // and sending email via the email service
  return
}

/**
 * Revoke all video tokens for a project
 */
export async function revokeProjectVideoTokens(projectId: string): Promise<void> {
  const redis = getRedis()
  
  const stream = redis.scanStream({
    match: 'video_access:*',
    count: 100
  })
  
  const keysToDelete: string[] = []
  
  stream.on('data', async (keys: string[]) => {
    for (const key of keys) {
      const data = await redis.get(key)
      if (data) {
        const tokenData: VideoAccessToken = JSON.parse(data)
        if (tokenData.projectId === projectId) {
          keysToDelete.push(key)
        }
      }
    }
  })
  
  stream.on('end', async () => {
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete)
    }
  })
}
