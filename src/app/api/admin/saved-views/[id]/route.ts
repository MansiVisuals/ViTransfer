import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const projectMessages = messages?.projects || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) return authResult

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: projectMessages.tooManyRequestsGeneric || 'Too many requests. Please slow down.',
  }, 'admin-saved-views-delete')
  if (rateLimitResult) return rateLimitResult

  const { id } = await params

  try {
    // Scoping the delete to the authenticated user's id eliminates cross-user IDOR.
    const result = await prisma.adminSavedView.deleteMany({
      where: { id, userId: authResult.id },
    })
    if (result.count === 0) {
      return NextResponse.json({ error: projectMessages.savedViewNotFound || 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: projectMessages.unableToProcessRequest || 'Unable to process request' },
      { status: 500 }
    )
  }
}
