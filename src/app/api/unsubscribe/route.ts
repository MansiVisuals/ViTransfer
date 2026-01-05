import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { verifyRecipientUnsubscribeToken } from '@/lib/unsubscribe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many requests. Please slow down.',
  }, 'unsubscribe')
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json().catch(() => null)
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
    console.error('Unsubscribe error:', error)
    return NextResponse.json({ success: true })
  }
}
