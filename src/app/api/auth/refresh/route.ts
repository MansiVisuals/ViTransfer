import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyRefreshToken, createSession, deleteSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { revokeToken } from '@/lib/token-revocation'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'

export const dynamic = 'force-dynamic'

/**
 * Secure Token Refresh Endpoint
 *
 * JWT Security Best Practices Implemented:
 *
 * 1. REFRESH TOKEN ROTATION
 *    - Each refresh generates NEW refresh token
 *    - Old refresh token is immediately revoked
 *    - Prevents token replay attacks
 *
 * 2. FINGERPRINT VALIDATION
 *    - Validates User-Agent consistency
 *    - Detects token theft across devices
 *    - Optional: Can add IP address validation
 *
 * 3. AUTOMATIC REVOCATION ON SUSPICIOUS ACTIVITY
 *    - If stolen token is reused, revoke ALL user tokens
 *    - Forces re-authentication everywhere
 *    - Mitigates token theft impact
 *
 * 4. SHORT-LIVED ACCESS TOKENS
 *    - Access token: 15 minutes
 *    - Refresh token: 7 days
 *    - Limits exposure window
 *
 * 5. HTTPONLY + SECURE COOKIES
 *    - Prevents XSS token theft
 *    - HTTPS-only in production
 *    - SameSite=strict prevents CSRF
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const refreshTokenCookie = cookieStore.get('vitransfer_refresh')

    if (!refreshTokenCookie?.value) {
      return NextResponse.json(
        { error: 'No refresh token provided' },
        { status: 401 }
      )
    }

    const refreshToken = refreshTokenCookie.value

    // SECURITY: Verify refresh token signature and expiration
    const payload = await verifyRefreshToken(refreshToken)

    if (!payload) {
      // Invalid or expired refresh token
      await deleteSession()
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      )
    }

    // SECURITY: Fingerprint validation (User-Agent consistency)
    // Detects if token was stolen and used from different device
    const currentUserAgent = request.headers.get('user-agent') || 'unknown'
    const storedFingerprint = await getTokenFingerprint(payload.userId, refreshToken)

    if (storedFingerprint && storedFingerprint !== hashFingerprint(currentUserAgent)) {
      // SECURITY ALERT: Token used from different device!
      // This indicates possible token theft
      console.error(`[SECURITY] Refresh token fingerprint mismatch for user ${payload.userId}`)

      // Revoke ALL user tokens to force re-authentication everywhere
      await revokeAllUserTokens(payload.userId)
      await deleteSession()

      return NextResponse.json(
        { error: 'Security violation detected. Please log in again.' },
        { status: 403 }
      )
    }

    // Fetch current user data (in case role/email changed)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    })

    if (!user) {
      // User no longer exists
      await deleteSession()
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      )
    }

    // SECURITY: Revoke old refresh token (token rotation)
    // This prevents replay attacks - old token becomes invalid
    const decoded = jwt.decode(refreshToken) as any
    if (decoded?.exp) {
      const now = Math.floor(Date.now() / 1000)
      const ttl = Math.max(decoded.exp - now, 0)
      await revokeToken(refreshToken, ttl)
    }

    // SECURITY: Generate NEW refresh token + access token
    // This implements refresh token rotation
    await createSession(user)

    // SECURITY: Store fingerprint for new refresh token
    const newRefreshTokenCookie = cookieStore.get('vitransfer_refresh')
    if (newRefreshTokenCookie?.value) {
      await storeTokenFingerprint(
        user.id,
        newRefreshTokenCookie.value,
        hashFingerprint(currentUserAgent)
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      }
    })
  } catch (error) {
    console.error('[AUTH] Token refresh error:', error)
    await deleteSession()
    return NextResponse.json(
      { error: 'Token refresh failed' },
      { status: 500 }
    )
  }
}

/**
 * Hash fingerprint (User-Agent) for storage
 */
function hashFingerprint(userAgent: string): string {
  return crypto
    .createHash('sha256')
    .update(userAgent)
    .digest('base64url')
}

/**
 * Store token fingerprint in Redis
 * TTL matches refresh token duration (7 days)
 */
async function storeTokenFingerprint(
  userId: string,
  refreshToken: string,
  fingerprintHash: string
): Promise<void> {
  try {
    // Use Redis from token-revocation module
    const { getRedis } = await import('@/lib/token-revocation')
    const redis = getRedis()

    const key = `token_fingerprint:${userId}:${hashToken(refreshToken)}`
    const ttl = 7 * 24 * 60 * 60 // 7 days in seconds

    await redis.setex(key, ttl, fingerprintHash)
  } catch (error) {
    console.error('[AUTH] Failed to store token fingerprint:', error)
    // Don't fail the request if fingerprint storage fails
  }
}

/**
 * Get stored token fingerprint from Redis
 */
async function getTokenFingerprint(
  userId: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const { getRedis } = await import('@/lib/token-revocation')
    const redis = getRedis()

    const key = `token_fingerprint:${userId}:${hashToken(refreshToken)}`
    const fingerprint = await redis.get(key)

    return fingerprint
  } catch (error) {
    console.error('[AUTH] Failed to get token fingerprint:', error)
    return null
  }
}

/**
 * Hash token for use as Redis key
 */
function hashToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('base64url')
    .substring(0, 16) // Use first 16 chars for key
}

/**
 * Revoke all tokens for a user (emergency security measure)
 */
async function revokeAllUserTokens(userId: string): Promise<void> {
  try {
    const { revokeAllUserTokens } = await import('@/lib/token-revocation')
    await revokeAllUserTokens(userId)
  } catch (error) {
    console.error('[SECURITY] Failed to revoke all user tokens:', error)
  }
}
