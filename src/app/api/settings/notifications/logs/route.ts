import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) return authResult

  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 120,
      message: 'Too many requests. Please slow down.',
    },
    'settings-notifications-logs',
    authResult.id
  )
  if (rateLimitResult) return rateLimitResult

  try {
    const url = new URL(request.url)
    const destinationId = url.searchParams.get('destinationId') || undefined
    const limitRaw = url.searchParams.get('limit')
    const limit = Math.min(Math.max(limitRaw ? parseInt(limitRaw, 10) : 50, 1), 200)

    const logs = await prisma.notificationDeliveryLog.findMany({
      where: destinationId ? { destinationId } : undefined,
      orderBy: { sentAt: 'desc' },
      take: limit,
      include: {
        destination: {
          select: {
            id: true,
            name: true,
            provider: true,
          },
        },
      },
    })

    return NextResponse.json(
      logs.map((log) => ({
        id: log.id,
        destinationId: log.destinationId,
        destination: log.destination,
        eventType: log.eventType,
        success: log.success,
        statusCode: log.statusCode,
        error: log.error,
        sentAt: log.sentAt,
      }))
    )
  } catch (error) {
    console.error('Error fetching notification logs:', error)
    return NextResponse.json({ error: 'Failed to fetch notification logs' }, { status: 500 })
  }
}

