import { NextRequest, NextResponse } from 'next/server'
import { generateCsrfToken, getCsrfSessionIdentifier } from '@/lib/security/csrf'
import { isHttpsEnabled } from '@/lib/settings'
import { rateLimit } from '@/lib/rate-limit'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

/**
 * CSRF Token Endpoint
 *
 * GET /api/csrf
 *
 * Returns a CSRF token for the current session
 * Token must be included in X-CSRF-Token header for all state-changing requests
 *
 * SECURITY: Requires active session (admin or share)
 * SECURITY: Token bound to session identifier
 * SECURITY: 1-hour TTL, stored in Redis
 */
export async function GET(request: NextRequest) {
  // Rate limiting: 60 requests per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many requests. Please slow down.'
  }, 'csrf-token-gen')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    // Get session identifier (admin or share session)
    const sessionIdentifier = await getCsrfSessionIdentifier(request)

    if (!sessionIdentifier) {
      return NextResponse.json(
        { error: 'No active session' },
        { status: 401 }
      )
    }

    // Generate CSRF token
    const csrfToken = await generateCsrfToken(sessionIdentifier)

    // Get HTTPS setting for cookie
    const httpsEnabled = await isHttpsEnabled()

    // Set CSRF token as httpOnly cookie (double-submit pattern)
    const response = NextResponse.json({
      csrfToken,
      expiresIn: 3600, // 1 hour
    })

    response.cookies.set({
      name: 'csrf_token',
      value: csrfToken,
      path: '/',
      httpOnly: true,
      secure: httpsEnabled,
      sameSite: 'strict',
      maxAge: 3600, // 1 hour
    })

    return response
  } catch (error) {
    console.error('Error generating CSRF token:', error)
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 500 }
    )
  }
}
