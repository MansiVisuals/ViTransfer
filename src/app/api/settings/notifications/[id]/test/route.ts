import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { enqueueExternalNotification } from '@/lib/external-notifications/enqueueExternalNotification'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) return authResult

  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 20,
      message: 'Too many requests. Please slow down.',
    },
    'settings-notifications-test',
    authResult.id
  )
  if (rateLimitResult) return rateLimitResult

  const { id } = await context.params

  try {
    const body = await request.json().catch(() => ({}))

    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'ViTransfer Test Notification'
    const message =
      typeof body.message === 'string' && body.message.trim()
        ? body.message.trim()
        : 'If you received this, your external notification destination is configured correctly.'

    await enqueueExternalNotification({
      destinationIds: [id],
      eventType: 'TEST',
      title,
      body: message,
      notifyType: 'info',
    })

    return NextResponse.json({ queued: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to queue test notification' }, { status: 500 })
  }
}

