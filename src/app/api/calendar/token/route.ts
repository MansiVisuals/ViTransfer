import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import crypto from 'crypto'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const calendarMessages = messages?.calendar || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) return NextResponse.json({ error: calendarMessages.notFound || 'Not found' }, { status: 404 })

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: calendarMessages.tooManyRequestsSlowDown || 'Too many requests. Please slow down.'
  }, 'calendar-token')
  if (rateLimitResult) return rateLimitResult

  try {
    const userId = authResult.id

    let calendarToken = await prisma.calendarToken.findUnique({
      where: { userId },
    })

    if (!calendarToken) {
      calendarToken = await prisma.calendarToken.create({
        data: {
          userId,
          token: crypto.randomBytes(32).toString('hex'),
        },
      })
    }

    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { appDomain: true },
    })

    const domain = settings?.appDomain || ''
    const feedUrl = `${domain}/api/calendar/feed?token=${calendarToken.token}`

    return NextResponse.json({ token: calendarToken.token, feedUrl })
  } catch {
    return NextResponse.json({ error: calendarMessages.operationFailed || 'Operation failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const calendarMessages = messages?.calendar || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) return NextResponse.json({ error: calendarMessages.notFound || 'Not found' }, { status: 404 })

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: calendarMessages.tooManyRequestsSlowDown || 'Too many requests. Please slow down.'
  }, 'calendar-token-regenerate')
  if (rateLimitResult) return rateLimitResult

  try {
    const userId = authResult.id

    await prisma.calendarToken.deleteMany({ where: { userId } })

    const newToken = await prisma.calendarToken.create({
      data: {
        userId,
        token: crypto.randomBytes(32).toString('hex'),
      },
    })

    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { appDomain: true },
    })

    const domain = settings?.appDomain || ''
    const feedUrl = `${domain}/api/calendar/feed?token=${newToken.token}`

    return NextResponse.json({ token: newToken.token, feedUrl })
  } catch {
    return NextResponse.json({ error: calendarMessages.operationFailed || 'Operation failed' }, { status: 500 })
  }
}
