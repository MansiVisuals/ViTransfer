import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import crypto from 'crypto'
import { parseBearerToken, refreshAdminTokens, revokePresentedTokens } from '@/lib/auth'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'




export const dynamic = 'force-dynamic'
export async function POST(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const authMessages = messages?.auth || {}

  try {
    const presentedToken = parseBearerToken(request)
    if (!presentedToken) {
      return NextResponse.json(
        { error: authMessages.noRefreshTokenProvided || 'No refresh token provided' },
        { status: 401 }
      )
    }

    const tokenHash = hashToken(presentedToken)

    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 8,
      message: authMessages.tooManyRefreshAttempts || 'Too many refresh attempts. Please wait a moment.',
    }, `auth-refresh:${tokenHash}`)
    if (rateLimitResult) return rateLimitResult

    const fingerprint = hashFingerprint(request.headers.get('user-agent') || 'unknown')
    const tokens = await refreshAdminTokens({ refreshToken: presentedToken, fingerprintHash: fingerprint })

    if (!tokens) {
      await revokePresentedTokens({ refreshToken: presentedToken })
      return NextResponse.json({ error: authMessages.invalidOrExpiredRefreshToken || 'Invalid or expired refresh token' }, { status: 401 })
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
    logError('[AUTH] Token refresh error:', error)
    return NextResponse.json(
      { error: authMessages.tokenRefreshFailed || 'Token refresh failed' },
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
