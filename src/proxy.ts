import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Edge-compatible proxy for Next.js 16+
 *
 * NOTE: This runs in Edge runtime and cannot use Node.js libraries like 'jose'.
 * JWT verification happens in API routes (src/lib/auth.ts) which run in Node.js runtime.
 * This proxy just checks if session cookie exists to provide fast redirects.
 */

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only protect /admin routes
  if (!pathname.startsWith('/admin')) {
    return NextResponse.next()
  }

  // Check for auth token (actual verification happens in API routes)
  const token = request.cookies.get('vitransfer_session')?.value

  if (!token) {
    // No token - redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Token exists - allow through (API routes will verify it properly)
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*']
}
