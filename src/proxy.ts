import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Block dangerous protocol schemes in any query parameter value
const DANGEROUS_PROTOCOL = /^(javascript|data|vbscript):/i

export async function proxy(request: NextRequest) {
  const url = request.nextUrl

  // Sanitize returnUrl on the login page — prevent javascript: XSS and open redirects
  if (url.pathname === '/login') {
    const returnUrl = url.searchParams.get('returnUrl')
    if (returnUrl && (!returnUrl.startsWith('/') || returnUrl.startsWith('//'))) {
      url.searchParams.set('returnUrl', '/admin/projects')
      return NextResponse.redirect(url)
    }
  }

  // Strip any query parameter containing javascript:/data:/vbscript: schemes
  // Prevents reflected XSS via Next.js RSC payload serialization
  let sanitized = false
  for (const [key, value] of url.searchParams.entries()) {
    if (DANGEROUS_PROTOCOL.test(value.trim())) {
      url.searchParams.delete(key)
      sanitized = true
    }
  }
  if (sanitized) {
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Match all page routes (not API or static assets)
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
}
