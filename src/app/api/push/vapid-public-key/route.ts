import { NextRequest, NextResponse } from 'next/server'
import { getVapidPublicKey } from '@/lib/push-notifications'
import { rateLimit } from '@/lib/rate-limit'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'


export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/push/vapid-public-key
 * Returns the VAPID public key for browser push subscription
 * This endpoint is public - anyone can request the public key
 */
export async function GET(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const webPushMessages = messages?.settings?.webPush || {}

  // Rate limit: 30 requests per minute per IP (public endpoint)
  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 1000, maxRequests: 30, message: webPushMessages.tooManyVapidKeyRequests || 'Too many requests. Please wait.' },
    'vapid-key'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    const publicKey = await getVapidPublicKey()
    return NextResponse.json({ publicKey })
  } catch (error) {
    logError('[API] Failed to get VAPID public key:', error)
    return NextResponse.json(
      { error: webPushMessages.failedToGetVapidKey || 'Failed to get VAPID public key' },
      { status: 500 }
    )
  }
}
