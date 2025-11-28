import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import crypto from 'crypto'
import { parseBearerToken, refreshAdminTokens, revokePresentedTokens } from '@/lib/auth'
export const runtime = 'nodejs'




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
 *    - Refresh token: 3 days
 *    - Limits exposure window
 *
 * 5. Explicit bearer tokens only (no implicit browser credentials)
 */
export async function POST(request: NextRequest) {
  try {
    const presentedToken = parseBearerToken(request)
    if (!presentedToken) {
      return NextResponse.json(
        { error: 'No refresh token provided' },
        { status: 401 }
      )
    }

    const tokenHash = hashToken(presentedToken)

    // Rate limit per refresh token hash to reduce brute-force/rotation abuse
    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 8,
      message: 'Too many refresh attempts. Please wait a moment.',
    }, `auth-refresh:${tokenHash}`)
    if (rateLimitResult) return rateLimitResult

    const fingerprint = hashFingerprint(request.headers.get('user-agent') || 'unknown')
    const tokens = await refreshAdminTokens({ refreshToken: presentedToken, fingerprintHash: fingerprint })

    if (!tokens) {
      await revokePresentedTokens({ refreshToken: presentedToken })
      return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      }
    })
  } catch (error) {
    console.error('[AUTH] Token refresh error:', error)
    return NextResponse.json(
      { error: 'Token refresh failed' },
      { status: 500 }
    )
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('base64url')
}

function hashFingerprint(userAgent: string): string {
  return crypto.createHash('sha256').update(userAgent).digest('base64url')
}
