import { NextRequest, NextResponse } from 'next/server'
import { generatePasskeyAuthenticationOptions } from '@/lib/passkey'
import { isPasskeyConfigured } from '@/lib/settings'
import { checkRateLimit } from '@/lib/rate-limit'
import { getClientIpAddress } from '@/lib/utils'

/**
 * Generate PassKey Authentication Options
 *
 * POST /api/auth/passkey/authenticate/options
 *
 * SECURITY:
 * - No authentication required (this is the login endpoint)
 * - Rate limiting applied (same as regular login)
 * - Generates challenge and stores in Redis (5-min TTL)
 * - Challenge is one-time use (deleted after verification)
 *
 * Body:
 * - email?: string (optional for usernameless auth)
 *
 * Returns:
 * - PublicKeyCredentialRequestOptions for browser
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body early to get email for rate limiting
    const body = await request.json().catch(() => ({}))
    const { email } = body

    // SECURITY: Rate limit check (prevents DoS, email enumeration)
    const rateLimitKey = email || getClientIpAddress(request)
    const rateLimitCheck = await checkRateLimit(request, 'login', rateLimitKey)
    if (rateLimitCheck.limited) {
      return NextResponse.json(
        {
          error: 'Too many requests. Please try again later.',
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

    // Check if PassKey is configured
    const configured = await isPasskeyConfigured()
    if (!configured) {
      return NextResponse.json(
        {
          error:
            'PassKey authentication is not configured.',
        },
        { status: 503 }
      )
    }

    // Generate authentication options
    const { options, sessionId } = await generatePasskeyAuthenticationOptions(email)

    return NextResponse.json({
      options,
      sessionId, // Return sessionId for usernameless auth
    })
  } catch (error) {
    console.error('[PASSKEY] Authentication options error:', error)

    // Return user-friendly error
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to generate PassKey authentication options'

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    )
  }
}
