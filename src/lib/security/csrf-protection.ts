import { NextRequest, NextResponse } from 'next/server'
import {
  getCsrfTokenFromRequest,
  getCsrfSessionIdentifier,
  verifyCsrfToken,
  validateOrigin,
} from './csrf'
import { logSecurityEvent } from '@/lib/video-access'
import { getClientIpAddress } from '@/lib/utils'

/**
 * CSRF Protection Middleware Helper
 *
 * Validates CSRF tokens on state-changing requests
 * Call this in POST/PUT/PATCH/DELETE route handlers
 *
 * Usage:
 * ```typescript
 * export async function POST(request: NextRequest) {
 *   const csrfCheck = await validateCsrfProtection(request)
 *   if (csrfCheck) return csrfCheck // Returns 403 error response
 *
 *   // Continue with request handling...
 * }
 * ```
 */
export async function validateCsrfProtection(
  request: NextRequest,
  options: {
    skipPaths?: string[] // Paths to skip CSRF validation (e.g., webhooks)
    requireToken?: boolean // Default true - require CSRF token
    requireOrigin?: boolean // Default true - require valid origin/referer
  } = {}
): Promise<NextResponse | null> {
  const {
    skipPaths = [],
    requireToken = true,
    requireOrigin = true,
  } = options

  // Check if this path should skip CSRF validation
  const url = new URL(request.url)
  if (skipPaths.some(path => url.pathname.startsWith(path))) {
    return null // Skip validation
  }

  // Only validate on state-changing methods
  const method = request.method
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return null // Skip for GET, HEAD, OPTIONS
  }

  // LAYER 1: Origin/Referer Validation
  if (requireOrigin) {
    const originValid = validateOrigin(request)
    if (!originValid) {
      await logSecurityEvent({
        type: 'CSRF_ORIGIN_MISMATCH',
        severity: 'WARNING',
        ipAddress: getClientIpAddress(request),
        details: {
          method,
          path: url.pathname,
          origin: request.headers.get('origin'),
          referer: request.headers.get('referer'),
          host: request.headers.get('host'),
        },
        wasBlocked: true,
      })

      return NextResponse.json(
        { error: 'Invalid origin' },
        { status: 403 }
      )
    }
  }

  // LAYER 2: CSRF Token Validation
  if (requireToken) {
    // Get session identifier
    const sessionIdentifier = await getCsrfSessionIdentifier(request)
    if (!sessionIdentifier) {
      // No session - could be public endpoint or unauthenticated request
      // Let the route handler decide if auth is required
      return null
    }

    // Get CSRF token from request
    const csrfToken = getCsrfTokenFromRequest(request)

    // Verify token
    const tokenValid = await verifyCsrfToken(sessionIdentifier, csrfToken)

    if (!tokenValid) {
      await logSecurityEvent({
        type: 'CSRF_TOKEN_INVALID',
        severity: 'WARNING',
        sessionId: sessionIdentifier,
        ipAddress: getClientIpAddress(request),
        details: {
          method,
          path: url.pathname,
          tokenPresent: !!csrfToken,
        },
        wasBlocked: true,
      })

      return NextResponse.json(
        { error: 'Invalid or missing CSRF token' },
        { status: 403 }
      )
    }
  }

  // All checks passed
  return null
}

/**
 * Paths that should skip CSRF validation
 * Add webhook endpoints, TUS upload endpoints, or other special cases here
 */
export const CSRF_SKIP_PATHS = [
  '/api/tus', // TUS upload endpoint (uses its own auth)
  '/api/webhooks', // Webhook endpoints (use signature validation)
]
