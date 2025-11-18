import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Rate limiting: 120 requests per minute (session checks are frequent)
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 120,
    message: 'Too many requests. Please slow down.'
  }, 'session-check')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const user = await getCurrentUser()

    if (!user) {
      const response = NextResponse.json(
        { authenticated: false, user: null },
        { status: 401 }
      )
      
      // Add cache control headers
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
      response.headers.set('Pragma', 'no-cache')
      response.headers.set('Expires', '0')
      
      return response
    }

    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    })
    
    // Add cache control headers to prevent caching of user session data
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    
    return response
  } catch (error) {
    console.error('Session check error:', error)
    return NextResponse.json(
      { error: 'An error occurred checking session' },
      { status: 500 }
    )
  }
}
