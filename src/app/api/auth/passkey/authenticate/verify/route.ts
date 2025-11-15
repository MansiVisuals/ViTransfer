import { NextRequest, NextResponse } from 'next/server'
import { verifyPasskeyAuthentication } from '@/lib/passkey'
import { createSession } from '@/lib/auth'
import { checkRateLimit, incrementRateLimit, clearRateLimit } from '@/lib/rate-limit'
import { getClientIpAddress } from '@/lib/utils'
import type { AuthenticationResponseJSON } from '@simplewebauthn/browser'

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

      return NextResponse.json(
        { success: false, error: result.error || 'Authentication failed' },
        { status: 401 }
      )
    }

    // SUCCESSFUL LOGIN: Clear rate limit counter
    await clearRateLimit(request, 'login', rateLimitKey)

    // Create session with JWT tokens (reuses existing auth infrastructure)
    await createSession(result.user)

    // Return user data (without password)
    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
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
