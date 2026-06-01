import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { safeParseBodyTolerant } from '@/lib/validation'
import { verifyRecipientUnsubscribeToken } from '@/lib/unsubscribe'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'


export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const unsubscribeMessages = messages?.unsubscribe || {}

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: unsubscribeMessages.tooManyRequestsSlowDown || 'Too many requests. Please slow down.',
  }, 'unsubscribe')
  if (rateLimitResult) return rateLimitResult

  try {
    const parsed = await safeParseBodyTolerant(request)
    if (!parsed.success) return parsed.response
    const body = parsed.data
    const token = typeof body?.token === 'string' ? body.token : ''

    const payload = token ? verifyRecipientUnsubscribeToken(token) : null
    if (payload) {
      await prisma.projectRecipient.updateMany({
        where: {
          id: payload.recipientId,
          projectId: payload.projectId,
          email: { equals: payload.recipientEmail, mode: 'insensitive' },
          receiveNotifications: true,
        },
        data: { receiveNotifications: false },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logError('Unsubscribe error:', error)
    return NextResponse.json({ success: true })
  }
}
