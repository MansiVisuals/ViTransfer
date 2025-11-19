import { NextRequest, NextResponse } from 'next/server'

/**
 * Security Headers Middleware
 *
 * Adds security headers to all responses:
 * - Content Security Policy (CSP)
 * - X-Frame-Options
 * - X-Content-Type-Options
 * - Referrer-Policy
 * - Permissions-Policy
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Content Security Policy
  // Note: Using 'unsafe-inline' and 'unsafe-eval' for Next.js compatibility
  // Adjust these based on your actual needs
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-eval
    "style-src 'self' 'unsafe-inline'", // Tailwind requires unsafe-inline
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "object-src 'none'",
    "frame-ancestors 'none'", // Prevent clickjacking
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests", // Upgrade HTTP to HTTPS
  ]

  response.headers.set('Content-Security-Policy', cspDirectives.join('; '))

  // Prevent clickjacking - deny all framing
  response.headers.set('X-Frame-Options', 'DENY')

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff')

  // Referrer policy - only send origin on cross-origin requests
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Permissions policy - block unnecessary features
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  )

  return response
}

// Apply middleware to all routes except static files
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
