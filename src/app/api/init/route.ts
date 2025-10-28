import { NextRequest, NextResponse } from 'next/server'
import { ensureDefaultAdmin } from '@/lib/seed'
import { rateLimit } from '@/lib/rate-limit'

// This route is called during app initialization
export const dynamic = 'force-dynamic'

/**
 * GET /api/init
 * 
 * Initializes the application by ensuring a default admin exists.
 * This endpoint is idempotent - it won't create duplicate admins.
 * 
 * SECURITY: Rate limited to prevent abuse.
 * The endpoint itself is safe (idempotent), but we rate limit
 * to prevent DoS attacks from repeatedly calling initialization.
 */
export async function GET(request: NextRequest) {
  // Rate limiting: 5 requests per minute per IP
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 5,
    message: 'Too many initialization requests. Please try again later.'
  }, 'init-endpoint')
  
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    await ensureDefaultAdmin()
    return NextResponse.json({ status: 'ok', message: 'Initialization complete' })
  } catch (error) {
    console.error('Initialization error:', error)
    return NextResponse.json(
      { status: 'error', message: 'Initialization failed' },
      { status: 500 }
    )
  }
}
