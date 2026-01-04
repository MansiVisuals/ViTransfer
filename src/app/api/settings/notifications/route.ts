import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { encrypt } from '@/lib/encryption'
import { NOTIFICATION_EVENT_TYPES } from '@/lib/external-notifications/constants'
import { createNotificationDestinationSchema } from '@/lib/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function buildSubscriptions(input?: Record<string, boolean> | null) {
  const enabledByEvent = new Map<string, boolean>()

  for (const eventType of NOTIFICATION_EVENT_TYPES) {
    enabledByEvent.set(eventType, true)
  }

  if (input) {
    for (const [eventType, enabled] of Object.entries(input)) {
      if (NOTIFICATION_EVENT_TYPES.includes(eventType as any)) {
        enabledByEvent.set(eventType, !!enabled)
      }
    }
  }

  return Array.from(enabledByEvent.entries()).map(([eventType, enabled]) => ({
    eventType,
    enabled,
  }))
}

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
    'settings-notifications-read',
    authResult.id
  )
  if (rateLimitResult) return rateLimitResult

  try {
    const destinations = await prisma.notificationDestination.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        subscriptions: true,
      },
    })

    return NextResponse.json(
      destinations.map((dest) => ({
        id: dest.id,
        name: dest.name,
        enabled: dest.enabled,
        provider: dest.provider,
        config: dest.config,
        hasSecrets: !!dest.secretsEncrypted,
        subscriptions: dest.subscriptions.reduce<Record<string, boolean>>((acc, sub) => {
          acc[sub.eventType] = sub.enabled
          return acc
        }, {}),
        createdAt: dest.createdAt,
        updatedAt: dest.updatedAt,
      }))
    )
  } catch (error) {
    console.error('Error fetching notification destinations:', error)
    return NextResponse.json({ error: 'Failed to fetch notification destinations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) return authResult

  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 20,
      message: 'Too many requests. Please slow down.',
    },
    'settings-notifications-create',
    authResult.id
  )
  if (rateLimitResult) return rateLimitResult

  try {
    const json = await request.json()
    const parsed = createNotificationDestinationSchema.parse(json)

    const secretsEncrypted =
      parsed.provider === 'NTFY' && !parsed.secrets.accessToken
        ? null
        : encrypt(JSON.stringify(parsed.secrets))
    const subscriptionRows = buildSubscriptions(parsed.subscriptions ?? null)

    const created = await prisma.notificationDestination.create({
      data: {
        name: parsed.name,
        enabled: true,
        provider: parsed.provider,
        config: parsed.config,
        secretsEncrypted: secretsEncrypted ?? undefined,
        subscriptions: {
          createMany: {
            data: subscriptionRows,
          },
        },
      },
      include: {
        subscriptions: true,
      },
    })

    return NextResponse.json(
      {
        id: created.id,
        name: created.name,
        enabled: created.enabled,
        provider: created.provider,
        config: created.config,
        hasSecrets: !!created.secretsEncrypted,
        subscriptions: created.subscriptions.reduce<Record<string, boolean>>((acc, sub) => {
          acc[sub.eventType] = sub.enabled
          return acc
        }, {}),
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create notification destination' }, { status: 500 })
  }
}
