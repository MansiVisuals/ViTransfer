import { NextRequest, NextResponse } from 'next/server'
import { verifyPasskeyAuthentication } from '@/lib/passkey'
import { checkRateLimit, incrementRateLimit, clearRateLimit } from '@/lib/rate-limit'
import { getClientIpAddress } from '@/lib/utils'
import type { AuthenticationResponseJSON } from '@simplewebauthn/browser'
import { issueAdminTokens } from '@/lib/auth'
import { enqueueExternalNotification } from '@/lib/external-notifications/enqueueExternalNotification'
import { getAppUrl } from '@/lib/url'
import crypto from 'crypto'
export const runtime = 'nodejs'




/**
 * Verify PassKey Authentication Response
 *
 * POST /api/auth/passkey/authenticate/verify
 *
 * SECURITY:
 * - Rate limiting on FAILED attempts (same as password login)
 * - Retrieves and DELETES challenge from Redis (one-time use)
 * - Verifies WebAuthn signature
 * - Updates credential counter (replay attack prevention)
 * - Creates JWT session on success
 * - Tracks IP for security
 *
 * Body:
 * - response: AuthenticationResponseJSON from @simplewebauthn/browser
 * - email?: string (optional, for better UX)
 *
 * Returns:
 * - { success: true, user: AuthUser } on success
 * - { success: false, error: string } on failure
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json()
    const response = body.response as AuthenticationResponseJSON
    const sessionId = body.sessionId as string | undefined

    if (!response || !response.id) {
      return NextResponse.json(
        { success: false, error: 'Invalid authentication response' },
        { status: 400 }
      )
    }

    // Check rate limit (tied to IP for usernameless auth)
    const rateLimitKey = getClientIpAddress(request)
    const rateLimitCheck = await checkRateLimit(request, 'login', rateLimitKey)
    if (rateLimitCheck.limited) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many failed login attempts. Please try again later.',
          retryAfter: rateLimitCheck.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitCheck.retryAfter || 900),
          },
        }
      )
    }

    // Get client IP for security tracking
    const ipAddress = getClientIpAddress(request)

    // Verify authentication
    const result = await verifyPasskeyAuthentication(response, sessionId, ipAddress)

    if (!result.success || !result.user) {
      // FAILED LOGIN: Increment rate limit counter
      await incrementRateLimit(request, 'login', rateLimitKey)

      void enqueueExternalNotification({
        eventType: 'FAILED_LOGIN',
        title: 'Failed Admin Login Attempts',
        body: await (async () => {
          const baseUrl = await getAppUrl(request).catch(() => '')
          const fallbackLink = baseUrl ? `${baseUrl}/login` : null
          const referer = request.headers.get('referer') || ''
          const link = (() => {
            if (!baseUrl || !referer) return fallbackLink
            try {
              const ref = new URL(referer)
              if (ref.origin !== baseUrl) return fallbackLink
              if (ref.pathname !== '/login') return fallbackLink
              const returnUrl = ref.searchParams.get('returnUrl')
              if (!returnUrl) return fallbackLink
              return `${baseUrl}/login?returnUrl=${encodeURIComponent(returnUrl)}`
            } catch {
              return fallbackLink
            }
          })()

          return ['Method: Passkey', link ? `Link: ${link}` : null].filter(Boolean).join('\n')
        })(),
        notifyType: 'warning',
      }).catch(() => {})

      return NextResponse.json(
        { success: false, error: result.error || 'Authentication failed' },
        { status: 401 }
      )
    }

    // SUCCESSFUL LOGIN: Clear rate limit counter
    await clearRateLimit(request, 'login', rateLimitKey)

    const fingerprint = crypto.createHash('sha256').update(request.headers.get('user-agent') || 'unknown').digest('base64url')
    const tokens = await issueAdminTokens(result.user, fingerprint)

    // Return user data (without password)
    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      },
    })
  } catch (error) {
    console.error('[PASSKEY] Authentication verification error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to verify PassKey authentication',
      },
      { status: 500 }
    )
  }
}
