import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { createSavedViewSchema, validateRequest } from '@/lib/validation'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const projectMessages = messages?.projects || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) return authResult

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: projectMessages.tooManyRequestsGeneric || 'Too many requests. Please slow down.',
  }, 'admin-saved-views-list')
  if (rateLimitResult) return rateLimitResult

  try {
    const views = await prisma.adminSavedView.findMany({
      where: { userId: authResult.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, state: true, createdAt: true },
    })
    return NextResponse.json({ views })
  } catch {
    return NextResponse.json(
      { error: projectMessages.unableToProcessRequest || 'Unable to process request' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const projectMessages = messages?.projects || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) return authResult

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: projectMessages.tooManyRequestsGeneric || 'Too many requests. Please slow down.',
  }, 'admin-saved-views-create')
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()
    const validation = validateRequest(createSavedViewSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error, details: validation.details }, { status: 400 })
    }

    // Cap per-user views to a sane number to prevent abuse
    const count = await prisma.adminSavedView.count({ where: { userId: authResult.id } })
    if (count >= 50) {
      return NextResponse.json(
        { error: projectMessages.savedViewsLimitReached || 'Saved view limit reached' },
        { status: 400 }
      )
    }

    const view = await prisma.adminSavedView.create({
      data: {
        userId: authResult.id,
        name: validation.data.name,
        state: validation.data.state,
      },
      select: { id: true, name: true, state: true, createdAt: true },
    })
    return NextResponse.json({ view })
  } catch {
    return NextResponse.json(
      { error: projectMessages.unableToProcessRequest || 'Unable to process request' },
      { status: 500 }
    )
  }
}
