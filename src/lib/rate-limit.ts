import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from './db'
import { getClientIpAddress } from './utils'
import { getRedis } from './redis'

/**
 * Production-Ready Redis-based Rate Limiting
 *
 * Security Features:
 * - NO in-memory fallback (fail closed for security)
 * - Persistent across server restarts (Redis storage)
 * - Works in distributed environments (multiple instances)
 * - Automatic expiration via Redis TTL
 * - Fails securely: returns error if Redis is unavailable
 *
 * Production Requirements:
 * - Redis MUST be available
 * - No graceful degradation that could bypass rate limiting
 * - Fail closed, not open
 */

interface RateLimitEntry {
  count: number
  firstAttempt: number
  lastAttempt: number
  lockoutUntil?: number
}

function getIdentifier(request: NextRequest, prefix: string = '', customKey?: string): string {
  // If a custom key is provided (e.g., username/email), use that instead of IP+UA
  // This prevents bypass via browser rotation for sensitive operations like login
  if (customKey) {
    const hash = crypto
      .createHash('sha256')
      .update(customKey.toLowerCase().trim())
      .digest('hex')
      .slice(0, 16)
    return `ratelimit:${prefix}:${hash}`
  }
  
  // Default: Use IP + User Agent for general rate limiting
  const ip = getClientIpAddress(request)
  
  const userAgent = request.headers.get('user-agent') || 'unknown'
  
  const hash = crypto
    .createHash('sha256')
    .update(`${ip}:${userAgent}`)
    .digest('hex')
    .slice(0, 16)
  
  return `ratelimit:${prefix}:${hash}`
}

async function getRateLimitEntry(identifier: string): Promise<RateLimitEntry | null> {
  const redis = getRedis()
  
  if (redis.status !== 'ready') {
    await redis.connect()
  }
  
  const data = await redis.get(identifier)
  if (!data) return null

  try {
    return JSON.parse(data) as RateLimitEntry
  } catch (error) {
    console.error('Failed to parse rate limit data:', error)
    return null
  }
}

async function setRateLimitEntry(
  identifier: string,
  entry: RateLimitEntry,
  ttlMs: number
): Promise<void> {
  const redis = getRedis()
  
  if (redis.status !== 'ready') {
    await redis.connect()
  }
  
  const ttlSeconds = Math.ceil(ttlMs / 1000)
  await redis.setex(identifier, ttlSeconds, JSON.stringify(entry))
}

async function deleteRateLimitEntry(identifier: string): Promise<void> {
  const redis = getRedis()
  
  if (redis.status !== 'ready') {
    await redis.connect()
  }
  
  await redis.del(identifier)
}

/**
 * General-purpose rate limiter
 * Returns NextResponse with 429 status if rate limit exceeded, null otherwise
 * Throws error if Redis is unavailable (fail closed)
 */
export async function rateLimit(
  request: NextRequest,
  options: {
    windowMs: number
    maxRequests: number
    message?: string
  },
  identifier: string = 'general',
  customKey?: string
): Promise<NextResponse | null> {
  try {
    const key = getIdentifier(request, identifier, customKey)
    const now = Date.now()
    const entry = await getRateLimitEntry(key)

    // Check for active lockout
    if (entry?.lockoutUntil && entry.lockoutUntil > now) {
      const retryAfter = Math.ceil((entry.lockoutUntil - now) / 1000)
      return NextResponse.json(
        { error: options.message || 'Too many requests', retryAfter },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(options.maxRequests),
            'X-RateLimit-Remaining': '0',
          }
        }
      )
    }

    // Reset if window expired
    if (!entry || now - entry.firstAttempt > options.windowMs) {
      await setRateLimitEntry(
        key,
        { count: 1, firstAttempt: now, lastAttempt: now },
        options.windowMs
      )
      return null
    }

    // Increment counter
    const newCount = entry.count + 1
    const updatedEntry: RateLimitEntry = {
      count: newCount,
      firstAttempt: entry.firstAttempt,
      lastAttempt: now,
    }

    // Check if limit exceeded
    if (newCount > options.maxRequests) {
      updatedEntry.lockoutUntil = now + options.windowMs
      await setRateLimitEntry(key, updatedEntry, options.windowMs)
      
      const retryAfter = Math.ceil(options.windowMs / 1000)
      return NextResponse.json(
        { error: options.message || 'Too many requests', retryAfter },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(options.maxRequests),
            'X-RateLimit-Remaining': '0',
          }
        }
      )
    }

    await setRateLimitEntry(key, updatedEntry, options.windowMs)
    return null
  } catch (error) {
    console.error('Rate limiting error:', error)
    // Fail closed: return 503 Service Unavailable if Redis is down
    return NextResponse.json(
      { error: 'Rate limiting service unavailable. Please try again later.' },
      { status: 503 }
    )
  }
}

/**
 * Login-specific rate limiter
 * Only increments on failed attempts, clears on success
 * Throws error if Redis is unavailable (fail closed)
 * 
 * @param customKey - Optional custom identifier (e.g., username/email for login attempts)
 *                    This prevents bypass via browser rotation
 */
export async function checkRateLimit(
  request: NextRequest,
  type: 'login' = 'login',
  customKey?: string
): Promise<{ limited: boolean; retryAfter?: number }> {
  try {
    const identifier = getIdentifier(request, type, customKey)
    const entry = await getRateLimitEntry(identifier)
    
    if (!entry) return { limited: false }

    const now = Date.now()

    if (entry.lockoutUntil && now >= entry.lockoutUntil) {
      await deleteRateLimitEntry(identifier)
      return { limited: false }
    }

    if (entry.lockoutUntil) {
      const retryAfter = Math.ceil((entry.lockoutUntil - now) / 1000)
      return { limited: true, retryAfter }
    }

    return { limited: false }
  } catch (error) {
    console.error('Rate limit check error:', error)
    // Fail closed: treat as rate limited if Redis is unavailable
    return { limited: true, retryAfter: 900 }
  }
}

export async function incrementRateLimit(
  request: NextRequest,
  type: 'login' = 'login',
  customKey?: string
): Promise<void> {
  try {
    const identifier = getIdentifier(request, type, customKey)
    const now = Date.now()
    const entry = await getRateLimitEntry(identifier)
    const windowMs = 15 * 60 * 1000 // 15 minutes

    // Get maxAttempts from SecuritySettings
    const settings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
      select: { passwordAttempts: true }
    })
    const maxAttempts = settings?.passwordAttempts || 5

    if (!entry || now - entry.firstAttempt > windowMs) {
      await setRateLimitEntry(
        identifier,
        { count: 1, firstAttempt: now, lastAttempt: now },
        windowMs
      )
      return
    }

    const newCount = entry.count + 1
    const updatedEntry: RateLimitEntry = {
      count: newCount,
      firstAttempt: entry.firstAttempt,
      lastAttempt: now,
    }

    if (newCount >= maxAttempts) {
      updatedEntry.lockoutUntil = now + windowMs
    }

    await setRateLimitEntry(identifier, updatedEntry, windowMs)
  } catch (error) {
    console.error('Rate limit increment error:', error)
    // Continue on error - we don't want to block legitimate operations
    // But log the error for monitoring
  }
}

export async function clearRateLimit(
  request: NextRequest,
  type: 'login' = 'login',
  customKey?: string
): Promise<void> {
  try {
    const identifier = getIdentifier(request, type, customKey)
    await deleteRateLimitEntry(identifier)
  } catch (error) {
    console.error('Rate limit clear error:', error)
    // Continue on error - don't block successful login
  }
}
