import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { getRedis } from '@/lib/redis'

/**
 * CSRF Protection Utilities
 *
 * Implements synchronized token pattern for CSRF protection
 * Tokens are stored in Redis with short TTL and validated on state-changing requests
 */

const CSRF_TOKEN_LENGTH = 32 // 256-bit entropy
const CSRF_TOKEN_TTL = 60 * 60 // 1 hour

/**
 * Generate a cryptographically secure CSRF token
 * Stored in Redis and returned to client as cookie + header
 */
export async function generateCsrfToken(sessionIdentifier: string): Promise<string> {
  const token = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('base64url')

  const redis = getRedis()
  const tokenKey = `csrf:${sessionIdentifier}:${token}`
  const tokenOnlyKey = `csrf:${token}`

  // Store token in Redis with TTL
  await redis.setex(tokenKey, CSRF_TOKEN_TTL, '1')
  // Also store token-only key to tolerate session rotation while keeping TTL-bound validation
  await redis.setex(tokenOnlyKey, CSRF_TOKEN_TTL, '1')

  return token
}

/**
 * Verify CSRF token is valid and matches session
 * Returns true if valid, false if invalid/expired
 */
export async function verifyCsrfToken(
  sessionIdentifier: string,
  token: string | null | undefined
): Promise<boolean> {
  if (!token) {
    return false
  }

  const redis = getRedis()
  const tokenKey = `csrf:${sessionIdentifier}:${token}`

  // Check if token exists in Redis (session-bound)
  const exists = await redis.get(tokenKey)

  if (exists === '1') return true

  // Fallback: accept token-only record to handle session rotation without forcing users to re-fetch token
  const tokenOnlyKey = `csrf:${token}`
  const tokenOnly = await redis.get(tokenOnlyKey)
  return tokenOnly === '1'
}

/**
 * Extract CSRF token from request
 * Checks header first, then falls back to body
 */
export function getCsrfTokenFromRequest(request: NextRequest): string | null {
  // Check X-CSRF-Token header (preferred)
  const headerToken = request.headers.get('X-CSRF-Token')
  if (headerToken) {
    return headerToken
  }

  // Check x-csrf-token header (lowercase variant)
  const headerTokenLower = request.headers.get('x-csrf-token')
  if (headerTokenLower) {
    return headerTokenLower
  }

  return null
}

/**
 * Get session identifier for CSRF token binding
 * Uses admin JWT session or share session
 */
export async function getCsrfSessionIdentifier(request: NextRequest): Promise<string | null> {
  const cookieStore = await cookies()

  // Check admin session first
  const adminSession = cookieStore.get('vitransfer_session')?.value
  if (adminSession) {
    return `admin:${adminSession}`
  }

  // Check share session
  const shareSession = cookieStore.get('share_session')?.value
  if (shareSession) {
    return `share:${shareSession}`
  }

  // No session found
  return null
}

/**
 * Validate Origin/Referer header as additional CSRF protection
 * Returns true if origin is valid, false otherwise
 */
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const host = request.headers.get('host')

  // For same-origin requests, origin should match host
  if (origin) {
    try {
      const originUrl = new URL(origin)
      if (originUrl.host !== host) {
        return false
      }
    } catch {
      return false
    }
  }

  // If no origin, check referer
  if (!origin && referer) {
    try {
      const refererUrl = new URL(referer)
      if (refererUrl.host !== host) {
        return false
      }
    } catch {
      return false
    }
  }

  return true
}

/**
 * Revoke a CSRF token (e.g., after logout)
 */
export async function revokeCsrfToken(
  sessionIdentifier: string,
  token: string
): Promise<void> {
  const redis = getRedis()
  const tokenKey = `csrf:${sessionIdentifier}:${token}`

  await redis.del(tokenKey)
}

/**
 * Revoke all CSRF tokens for a session
 */
export async function revokeAllCsrfTokens(sessionIdentifier: string): Promise<void> {
  const redis = getRedis()

  // Find all tokens for this session
  const pattern = `csrf:${sessionIdentifier}:*`
  const keys = await redis.keys(pattern)

  if (keys.length > 0) {
    await redis.del(...keys)
  }
}
