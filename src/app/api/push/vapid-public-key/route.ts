import { NextRequest, NextResponse } from 'next/server'
import { getVapidPublicKey } from '@/lib/push-notifications'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/push/vapid-public-key
 * Returns the VAPID public key for browser push subscription
 * This endpoint is public - anyone can request the public key
 */
export async function GET(request: NextRequest) {
  // Rate limit: 30 requests per minute per IP (public endpoint)
  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 1000, maxRequests: 30, message: 'Too many requests. Please wait.' },
    'vapid-key'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    const publicKey = await getVapidPublicKey()
    return NextResponse.json({ publicKey })
  } catch (error) {
    console.error('[API] Failed to get VAPID public key:', error)
    return NextResponse.json(
      { error: 'Failed to get VAPID public key' },
      { status: 500 }
    )
  }
}
