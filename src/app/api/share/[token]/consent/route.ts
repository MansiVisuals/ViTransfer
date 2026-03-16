import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getShareContext } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { getRedis } from '@/lib/redis'
import { getClientIpAddress } from '@/lib/utils'
import { getClientSessionTimeoutSeconds } from '@/lib/settings'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

/**
 * POST /api/share/[token]/consent
 *
 * Records the client's GDPR analytics consent choice.
 * - Accept (analyticsConsent: true): retroactively enriches the SharePageAccess
 *   record with full IP and user agent.
 * - Decline (analyticsConsent: false): stores the declined flag so future
 *   tracking within this session stays anonymized.
 *
 * Consent state is stored in Redis keyed by sessionId.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  await params

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many requests.'
  }, 'share-consent')
  if (rateLimitResult) return rateLimitResult

  const shareContext = await getShareContext(request)
  if (!shareContext) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const analyticsConsent = body.analyticsConsent === true

    const redis = getRedis()
    const ttlSeconds = await getClientSessionTimeoutSeconds()

    // Store consent in Redis for this session
    await redis.setex(
      `analytics_consent:${shareContext.sessionId}`,
      ttlSeconds,
      analyticsConsent ? 'true' : 'false'
    )

    // If accepted, retroactively update existing access records with PII
    if (analyticsConsent) {
      const ipAddress = getClientIpAddress(request)
      const userAgent = request.headers.get('user-agent') || null

      await prisma.sharePageAccess.updateMany({
        where: { sessionId: shareContext.sessionId },
        data: {
          ipAddress,
          userAgent,
        }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logError('[CONSENT] Failed to process consent:', error)
    return NextResponse.json({ error: 'Failed to process consent' }, { status: 500 })
  }
}
