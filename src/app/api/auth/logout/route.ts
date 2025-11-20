import { NextResponse, NextRequest } from 'next/server'
import { deleteSession } from '@/lib/auth'
import { isHttpsEnabled } from '@/lib/settings'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

/**
 * Secure Logout Endpoint
 * 
 * POST /api/auth/logout
 * 
 * Security Features:
 * 1. POST-only endpoint (prevents CSRF via GET requests)
 * 2. Validates origin to prevent cross-origin logout attacks
 * 3. Revokes JWT tokens server-side (adds to Redis blacklist)
 * 4. Deletes HttpOnly, Secure, SameSite cookies
 * 5. Returns cache control headers to prevent caching
 * 6. Returns 204 No Content (RESTful best practice for logout)
 * 
 * Token Revocation Strategy:
 * - Short-lived access tokens (15 min) limit exposure window
 * - Refresh tokens (7 days) are revoked in Redis
 * - Redis TTL matches token expiration (automatic cleanup)
 * - Cookie deletion is primary control (defense in depth)
 */
export async function POST(request: NextRequest) {
  try {
    const csrfCheck = await validateCsrfProtection(request, { requireToken: false })
    if (csrfCheck) return csrfCheck

    // CSRF Protection: Verify request origin
    // Only allow logout from same origin to prevent cross-site logout attacks
    const origin = request.headers.get('origin')
    const host = request.headers.get('host')
    
    if (origin && host) {
      const originUrl = new URL(origin)
      if (originUrl.host !== host) {
        return NextResponse.json(
          { error: 'Invalid origin' },
          { status: 403 }
        )
      }
    }

    // Delete session and revoke tokens
    // This function:
    // 1. Extracts tokens from cookies
    // 2. Adds tokens to Redis blacklist with TTL
    // 3. Deletes HttpOnly cookies
    await deleteSession()

    // Get HTTPS setting for cookie deletion
    const httpsEnabled = await isHttpsEnabled()

    // Return 204 No Content (standard for successful logout)
    // No response body needed
    const response = new NextResponse(null, { status: 204 })

    // Explicitly delete cookies in response (belt and suspenders approach)
    // Even though deleteSession() handles this, we set them here too
    // with Max-Age=0 to ensure immediate deletion
    response.cookies.set({
      name: 'vitransfer_session',
      value: '',
      path: '/',
      httpOnly: true,
      secure: httpsEnabled,
      sameSite: 'strict',
      maxAge: 0, // Immediate deletion
    })

    response.cookies.set({
      name: 'vitransfer_refresh',
      value: '',
      path: '/',
      httpOnly: true,
      secure: httpsEnabled,
      sameSite: 'strict',
      maxAge: 0, // Immediate deletion
    })

    // Cache Control: Prevent any caching of logout response
    // Ensures browsers don't cache the logout action
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    // Security Headers: Prevent clickjacking and XSS
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')

    return response
  } catch (error) {
    console.error('Logout error:', error)
    
    // Even on error, try to delete cookies
    const response = NextResponse.json(
      { error: 'An error occurred during logout' },
      { status: 500 }
    )
    
    // Still delete cookies on error (mirror secure attributes)
    const httpsEnabled = await isHttpsEnabled()

    response.cookies.set({
      name: 'vitransfer_session',
      value: '',
      path: '/',
      httpOnly: true,
      secure: httpsEnabled,
      sameSite: 'strict',
      maxAge: 0,
    })

    response.cookies.set({
      name: 'vitransfer_refresh',
      value: '',
      path: '/',
      httpOnly: true,
      secure: httpsEnabled,
      sameSite: 'strict',
      maxAge: 0,
    })
    
    return response
  }
}

/**
 * Reject GET requests to prevent CSRF
 * Logout must be POST to prevent malicious links like:
 * <img src="https://app.com/logout">
 *
 * Redirect to login page instead of showing technical error
 */
export async function GET(request: NextRequest) {
  // Extract base URL from request headers - NO HARDCODED FALLBACK
  const proto = request.headers.get('x-forwarded-proto') ||
                (request.url.startsWith('https') ? 'https' : 'http')
  const host = request.headers.get('x-forwarded-host') ||
               request.headers.get('host')

  if (!host) {
    // If we can't determine host, return error instead of redirect
    return NextResponse.json(
      { error: 'Unable to determine host for redirect' },
      { status: 500 }
    )
  }

  const baseUrl = `${proto}://${host}`

  return NextResponse.redirect(new URL('/login', baseUrl), {
    status: 302,
    headers: {
      'Allow': 'POST'
    }
  })
}
