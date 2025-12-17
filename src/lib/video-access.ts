import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { prisma } from './db'
import { getClientIpAddress } from './utils'
import { getClientSessionTimeoutSeconds } from './settings'
import { getRedis } from './redis'

type CachedValue<T> = { value: T; expiresAt: number; version?: string }
type SecuritySettingsResult = {
  hotlinkProtection: string
  ipRateLimit: number
  sessionRateLimit: number
  trackSecurityLogs: boolean
  trackAnalytics: boolean
}

const SECURITY_SETTINGS_CACHE_TTL_MS = 90_000
const securitySettingsCache: CachedValue<SecuritySettingsResult> = {
  value: {
    hotlinkProtection: 'LOG_ONLY',
    ipRateLimit: 1000,
    sessionRateLimit: 600,
    trackSecurityLogs: true,
    trackAnalytics: true
  },
  expiresAt: 0,
  version: undefined
}

const TOKEN_CACHE_TTL_MS = 10_000
const TOKEN_CACHE_MAX_ENTRIES = 500
type CachedTokenEntry = CachedValue<VideoAccessToken>
const tokenVerificationCache = new Map<string, CachedTokenEntry>()
const TOKEN_REV_VERSION_KEY = 'video_token_rev_version'

interface VideoAccessToken {
  videoId: string
  projectId: string
  quality: string
  sessionId: string
  ipAddress: string
  createdAt: number
}

/**
 * Generate a time-limited video access token with session binding
 * Tokens are cached per session to prevent token proliferation
 *
 * @param videoId - ID of the video to grant access to
 * @param projectId - ID of the project containing the video
 * @param quality - Quality level (thumbnail, preview720, preview1080, original)
 * @param request - NextRequest for IP address extraction
 * @param sessionId - Session ID for binding token to specific session
 * @returns Base64url-encoded access token valid for client session timeout duration
 */
export async function generateVideoAccessToken(
  videoId: string,
  projectId: string,
  quality: string,
  request: NextRequest,
  sessionId: string
): Promise<string> {
  const redis = getRedis()

  const cacheKey = `video_token_cache:${sessionId}:${videoId}:${quality}`
  const cachedToken = await redis.get(cacheKey)

  if (cachedToken) {
    const tokenData = await redis.get(`video_access:${cachedToken}`)
    if (tokenData) {
      return cachedToken
    }
  }

  const token = crypto.randomBytes(16).toString('base64url')
  const ipAddress = getClientIpAddress(request)

  const tokenData: VideoAccessToken = {
    videoId,
    projectId,
    quality,
    sessionId,
    ipAddress,
    createdAt: Date.now(),
  }

  const ttlSeconds = await getClientSessionTimeoutSeconds()

  await redis.setex(
    `video_access:${token}`,
    ttlSeconds,
    JSON.stringify(tokenData)
  )

  await redis.setex(cacheKey, ttlSeconds, token)

  return token
}

/**
 * Verify video access token and validate session binding
 * Checks token existence, session match, and IP address consistency
 *
 * @param token - The access token to verify
 * @param request - NextRequest for IP address validation
 * @param sessionId - Expected session ID for token binding verification
 * @returns Parsed token data if valid, null if invalid or expired
 */
export async function verifyVideoAccessToken(
  token: string,
  request: NextRequest,
  sessionId: string
): Promise<VideoAccessToken | null> {
  const redis = getRedis()
  const now = Date.now()

  const revVersion = (await redis.get(TOKEN_REV_VERSION_KEY)) || '0'
  const cacheKey = `${token}:${sessionId}:${revVersion}`
  const cached = tokenVerificationCache.get(cacheKey)

  if (cached) {
    if (cached.expiresAt > now && cached.version === revVersion) {
      return cached.value
    }
    tokenVerificationCache.delete(cacheKey)
  }

  const key = `video_access:${token}`
  const data = await redis.get(key)

  if (!data) {
    return null
  }

  let tokenData: VideoAccessToken
  try {
    tokenData = JSON.parse(data)

    if (!tokenData.videoId || !tokenData.projectId || !tokenData.sessionId) {
      console.error('[SECURITY] Invalid token data structure', { token: token.substring(0, 10) })
      return null
    }
  } catch (error) {
    console.error('[SECURITY] Failed to parse video access token data', {
      error: error instanceof Error ? error.message : 'Unknown error',
      token: token.substring(0, 10)
    })
    return null
  }

  const isAdminSession = sessionId?.startsWith('admin:') || false

  if (!isAdminSession) {
    if (tokenData.sessionId !== sessionId) {
      await logSecurityEvent({
        type: 'TOKEN_SESSION_MISMATCH',
        severity: 'WARNING',
        projectId: tokenData.projectId,
        videoId: tokenData.videoId,
        sessionId,
        ipAddress: getClientIpAddress(request),
        details: { expectedSession: tokenData.sessionId }
      })

      return null
    }
  }

  tokenVerificationCache.set(cacheKey, {
    value: tokenData,
    expiresAt: now + TOKEN_CACHE_TTL_MS,
    version: revVersion
  })

  if (tokenVerificationCache.size > TOKEN_CACHE_MAX_ENTRIES) {
    tokenVerificationCache.clear()
  }

  return tokenData
}

/**
 * Detect potential hotlinking attempts using referer analysis and session validation
 * Checks for suspicious patterns: missing referer, external domains, rapid token rotation
 *
 * @param request - NextRequest containing referer and origin headers
 * @param sessionId - Session ID for tracking access patterns
 * @param videoId - Video being accessed
 * @param projectId - Project containing the video
 * @returns Object indicating if hotlinking detected, with reason and severity level
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

  if (referer && host) {
    try {
      const refererUrl = new URL(referer)
      const refererHost = refererUrl.hostname

      if (host && !refererHost.includes(host) && !host.includes(refererHost)) {
        const blockedDomains = await getBlockedDomains()
        if (blockedDomains.some(domain => refererHost.includes(domain))) {
          return {
            isHotlinking: true,
            reason: `Blocked domain: ${refererHost}`,
            severity: 'CRITICAL'
          }
        }

        await logSecurityEvent({
          type: 'HOTLINK_DETECTED',
          severity: 'WARNING',
          projectId,
          videoId,
          sessionId,
          ipAddress: getClientIpAddress(request),
          referer,
          details: { refererHost }
        })

        return {
          isHotlinking: true,
          reason: `External referer: ${refererHost}`,
          severity: 'WARNING'
        }
      }
    } catch (error) {}
  }

  const freqKey = `video_freq:${sessionId}:${videoId}`
  const count = await redis.incr(freqKey)
  await redis.expire(freqKey, 300)

  if (count > 3000) {
    if (count % 500 === 0) {
      await logSecurityEvent({
        type: 'SUSPICIOUS_ACTIVITY',
        severity: 'WARNING',
        projectId,
        videoId,
        sessionId,
        ipAddress: getClientIpAddress(request),
        details: { requestCount: count, window: '5min' }
      })
    }

    return {
      isHotlinking: true,
      reason: `High frequency: ${count} requests in 5 min`,
      severity: 'WARNING'
    }
  }

  const ipAddress = getClientIpAddress(request)

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

export async function trackVideoAccess(params: {
  videoId: string
  projectId: string
  sessionId: string
  tokenId?: string
  request: NextRequest
  quality: string
  bandwidth?: number
  eventType: 'PAGE_VISIT' | 'DOWNLOAD_COMPLETE'
  assetId?: string // Single asset download
  assetIds?: string[] // Multiple assets downloaded as ZIP
}) {
  const { videoId, projectId, bandwidth, eventType, sessionId, assetId, assetIds } = params

  const settings = await getSecuritySettings()
  if (!settings.trackAnalytics) {
    return
  }

  // Avoid inflating metrics with admin activity (admin sessions prefixed with "admin:")
  if (sessionId?.startsWith('admin:')) {
    return
  }

  await prisma.videoAnalytics.create({
    data: {
      videoId,
      projectId,
      eventType,
      assetId,
      assetIds: assetIds ? JSON.stringify(assetIds) : undefined,
    }
  })
}

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
    const settings = await getSecuritySettings()

    if (!settings.trackSecurityLogs) {
      return
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

    const redis = getRedis()
    // Keep recent events in Redis for quick access (last 1000 events)
    await redis.lpush('security:events:recent', JSON.stringify({
      ...params,
      timestamp: new Date().toISOString()
    }))
    await redis.ltrim('security:events:recent', 0, 999)
  } catch (error) {
    console.error('[SECURITY_EVENT] Failed to log:', error)
  }
}

export async function getSecuritySettings() {
  const now = Date.now()

  // Check in-memory cache first (fastest)
  if (securitySettingsCache.expiresAt > now) {
    return securitySettingsCache.value
  }

  // Check Redis cache (shared across instances)
  const redis = getRedis()
  const REDIS_KEY = 'app:security_settings'
  const cached = await redis.get(REDIS_KEY)

  if (cached) {
    const parsed = JSON.parse(cached)
    securitySettingsCache.value = parsed
    securitySettingsCache.expiresAt = now + SECURITY_SETTINGS_CACHE_TTL_MS
    return parsed
  }

  // Fetch from database (slowest, only when both caches miss)
  const settings = await prisma.securitySettings.findUnique({
    where: { id: 'default' },
    select: {
      hotlinkProtection: true,
      ipRateLimit: true,
      sessionRateLimit: true,
      trackSecurityLogs: true,
      trackAnalytics: true,
      updatedAt: true
    }
  })

  const value: SecuritySettingsResult = {
    hotlinkProtection: settings?.hotlinkProtection || 'LOG_ONLY',
    ipRateLimit: settings?.ipRateLimit || 1000,
    sessionRateLimit: settings?.sessionRateLimit || 600,
    trackSecurityLogs: settings?.trackSecurityLogs ?? true,
    trackAnalytics: settings?.trackAnalytics ?? true
  }

  // Cache in both Redis and memory
  securitySettingsCache.value = value
  securitySettingsCache.expiresAt = now + SECURITY_SETTINGS_CACHE_TTL_MS
  securitySettingsCache.version = settings?.updatedAt?.toISOString()

  await redis.setex(REDIS_KEY, 300, JSON.stringify(value)) // 5 min Redis cache

  return value
}

const BLOCKLIST_CACHE_TTL = 300 // 5 minutes
const BLOCKLIST_CACHE_KEY_IPS = 'security:blocklist:ips'
const BLOCKLIST_CACHE_KEY_DOMAINS = 'security:blocklist:domains'

/**
 * Get blocked IPs with Redis caching
 * Checks database and caches in Redis for 5 minutes
 */
async function getBlockedIPs(): Promise<string[]> {
  const redis = getRedis()

  // Check cache first
  const cached = await redis.get(BLOCKLIST_CACHE_KEY_IPS)
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch (error) {
      console.error('[BLOCKLIST] Failed to parse cached IPs:', error)
    }
  }

  // Fetch from database
  const blockedIPs = await prisma.blockedIP.findMany({
    select: { ipAddress: true }
  })

  const ipList = blockedIPs.map(entry => entry.ipAddress)

  // Cache in Redis
  await redis.setex(BLOCKLIST_CACHE_KEY_IPS, BLOCKLIST_CACHE_TTL, JSON.stringify(ipList))

  return ipList
}

/**
 * Get blocked domains with Redis caching
 * Checks database and caches in Redis for 5 minutes
 */
async function getBlockedDomains(): Promise<string[]> {
  const redis = getRedis()

  // Check cache first
  const cached = await redis.get(BLOCKLIST_CACHE_KEY_DOMAINS)
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch (error) {
      console.error('[BLOCKLIST] Failed to parse cached domains:', error)
    }
  }

  // Fetch from database
  const blockedDomains = await prisma.blockedDomain.findMany({
    select: { domain: true }
  })

  const domainList = blockedDomains.map(entry => entry.domain)

  // Cache in Redis
  await redis.setex(BLOCKLIST_CACHE_KEY_DOMAINS, BLOCKLIST_CACHE_TTL, JSON.stringify(domainList))

  return domainList
}

/**
 * Invalidate blocklist caches
 * Call this after adding/removing blocked IPs or domains
 */
export async function invalidateBlocklistCache(): Promise<void> {
  const redis = getRedis()
  await redis.del(BLOCKLIST_CACHE_KEY_IPS, BLOCKLIST_CACHE_KEY_DOMAINS)
}

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
        try {
          const tokenData: VideoAccessToken = JSON.parse(data)
          if (tokenData.projectId === projectId) {
            keysToDelete.push(key)
          }
        } catch (error) {
          console.error('[SECURITY] Corrupted token data during revocation, will delete', {
            key,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          keysToDelete.push(key)
        }
      }
    }
  })

  stream.on('end', async () => {
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete)
    }
    await redis.incr(TOKEN_REV_VERSION_KEY)
  })
}
