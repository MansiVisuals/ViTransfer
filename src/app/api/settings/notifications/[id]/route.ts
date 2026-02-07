import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { decrypt, encrypt } from '@/lib/encryption'
import { NOTIFICATION_EVENT_TYPES } from '@/lib/external-notifications/constants'
import { updateNotificationDestinationSchema } from '@/lib/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function buildSubscriptionUpdates(input?: Record<string, boolean> | null) {
  if (!input) return []

  const updates: Array<{ eventType: string; enabled: boolean }> = []
  for (const [eventType, enabled] of Object.entries(input)) {
    if (NOTIFICATION_EVENT_TYPES.includes(eventType as any)) {
      updates.push({ eventType, enabled: !!enabled })
    }
  }
  return updates
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) return authResult

  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 60,
      message: 'Too many requests. Please slow down.',
    },
    'settings-notifications-update',
    authResult.id
  )
  if (rateLimitResult) return rateLimitResult

  const { id } = await context.params

  try {
    const existing = await prisma.notificationDestination.findUnique({
      where: { id },
      include: { subscriptions: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Notification destination not found' }, { status: 404 })
    }

    const json = await request.json()
    const parsed = updateNotificationDestinationSchema.parse(json)

    if (parsed.provider !== existing.provider) {
      return NextResponse.json(
        { error: 'Changing notification provider is not supported. Create a new destination instead.' },
        { status: 400 }
      )
    }

    const subscriptionUpdates = buildSubscriptionUpdates(parsed.subscriptions ?? null)
    let secretsToUpdate: string | null | undefined = undefined
    if (parsed.secrets) {
      const providedEntries = Object.entries(parsed.secrets).filter(
        ([, val]) => val !== undefined && val !== null && val !== ''
      )

      if (providedEntries.length > 0) {
        let currentSecrets: Record<string, any> = {}
        if (existing.secretsEncrypted) {
          try {
            currentSecrets = JSON.parse(decrypt(existing.secretsEncrypted)) || {}
          } catch {
            currentSecrets = {}
          }
        }

        const merged = {
          ...currentSecrets,
          ...Object.fromEntries(providedEntries),
        }

        // NTFY tokens are optional; allow the field to remain unset.
        if (parsed.provider === 'NTFY' && !merged.accessToken) {
          secretsToUpdate = null
        } else {
          secretsToUpdate = encrypt(JSON.stringify(merged))
        }
      }
    }

    await prisma.notificationDestination.update({
      where: { id },
      data: {
        name: parsed.name,
        enabled: true,
        config: parsed.config,
        ...(secretsToUpdate !== undefined ? { secretsEncrypted: secretsToUpdate } : {}),
      },
      include: { subscriptions: true },
    })

    if (subscriptionUpdates.length > 0) {
      await Promise.all(
        subscriptionUpdates.map((sub) =>
          prisma.notificationSubscription.upsert({
            where: {
              destinationId_eventType: {
                destinationId: id,
                eventType: sub.eventType,
              },
            },
            update: { enabled: sub.enabled },
            create: {
              destinationId: id,
              eventType: sub.eventType,
              enabled: sub.enabled,
            },
          })
        )
      )
    }

    const refreshed = await prisma.notificationDestination.findUnique({
      where: { id },
      include: { subscriptions: true },
    })

    return NextResponse.json({
      id: refreshed!.id,
      name: refreshed!.name,
      enabled: refreshed!.enabled,
      provider: refreshed!.provider,
      config: refreshed!.config,
      hasSecrets: !!refreshed!.secretsEncrypted,
      subscriptions: refreshed!.subscriptions.reduce<Record<string, boolean>>((acc, sub) => {
        acc[sub.eventType] = sub.enabled
        return acc
      }, {}),
      createdAt: refreshed!.createdAt,
      updatedAt: refreshed!.updatedAt,
    })
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to update notification destination' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) return authResult

  const rateLimitResult = await rateLimit(
    request,
    {
      windowMs: 60 * 1000,
      maxRequests: 20,
      message: 'Too many requests. Please slow down.',
    },
    'settings-notifications-delete',
    authResult.id
  )
  if (rateLimitResult) return rateLimitResult

  const { id } = await context.params

  try {
    await prisma.notificationDestination.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete notification destination' }, { status: 500 })
  }
}
