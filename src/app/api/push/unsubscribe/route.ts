import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/push/unsubscribe
 * Unsubscribe the browser from push notifications
 */
export async function POST(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limit: 20 unsubscribe attempts per hour per admin
  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 60 * 1000, maxRequests: 20, message: 'Too many requests. Please wait.' },
    'push-unsubscribe',
    authResult.id
  )
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()
    const { endpoint, subscriptionId } = body

    // Support unsubscribe by endpoint or subscriptionId
    if (!endpoint && !subscriptionId) {
      return NextResponse.json(
        { error: 'Either endpoint or subscriptionId is required' },
        { status: 400 }
      )
    }

    let deleted = false

    if (subscriptionId) {
      // Delete by subscription ID (verify ownership)
      const result = await prisma.pushSubscription.deleteMany({
        where: {
          id: subscriptionId,
          userId: authResult.id,
        },
      })
      deleted = result.count > 0
    } else if (endpoint) {
      // Delete by endpoint (verify ownership)
      const result = await prisma.pushSubscription.deleteMany({
        where: {
          endpoint,
          userId: authResult.id,
        },
      })
      deleted = result.count > 0
    }

    if (!deleted) {
      return NextResponse.json(
        { error: 'Subscription not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] Failed to unsubscribe:', error)
    return NextResponse.json(
      { error: 'Failed to unsubscribe' },
      { status: 500 }
    )
  }
}
