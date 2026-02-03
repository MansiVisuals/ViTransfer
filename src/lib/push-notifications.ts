import webpush from 'web-push'
import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encryption'
import type { NotificationEventType } from '@/lib/external-notifications/constants'

/**
 * Get VAPID subject from app domain or fallback
 * The VAPID subject identifies who is sending push notifications.
 * It can be a mailto: URL or the app's domain URL.
 */
async function getVapidSubject(): Promise<string> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { appDomain: true },
    })

    // Use the app domain if configured (preferred for self-hosted instances)
    if (settings?.appDomain) {
      // Ensure it's a valid URL format
      const domain = settings.appDomain.startsWith('http')
        ? settings.appDomain
        : `https://${settings.appDomain}`
      return domain
    }
  } catch {
    // Fall back to default if database not available
  }

  // Fallback: generic mailto that works for all instances
  // This is safe because VAPID subject is just an identifier for push services
  return 'mailto:push@localhost'
}

interface VapidKeys {
  publicKey: string
  privateKey: string
}

/**
 * Generate new VAPID keys
 */
function generateVapidKeys(): VapidKeys {
  const keys = webpush.generateVAPIDKeys()
  return {
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  }
}

/**
 * Get or create VAPID keys (auto-generate on first use)
 * Keys are stored encrypted in the database
 */
export async function getOrCreateVapidKeys(): Promise<VapidKeys> {
  // Try to get existing keys from settings
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
    select: { vapidPublicKey: true, vapidPrivateKey: true },
  })

  if (settings?.vapidPublicKey && settings?.vapidPrivateKey) {
    // Decrypt the private key
    return {
      publicKey: settings.vapidPublicKey,
      privateKey: decrypt(settings.vapidPrivateKey),
    }
  }

  // Generate new keys
  console.log('[WEB-PUSH] Generating new VAPID keys...')
  const keys = generateVapidKeys()

  // Store keys (encrypt the private key)
  await prisma.settings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      vapidPublicKey: keys.publicKey,
      vapidPrivateKey: encrypt(keys.privateKey),
    },
    update: {
      vapidPublicKey: keys.publicKey,
      vapidPrivateKey: encrypt(keys.privateKey),
    },
  })

  console.log('[WEB-PUSH] VAPID keys generated and stored')
  return keys
}

/**
 * Get the public VAPID key (for browser subscription)
 */
export async function getVapidPublicKey(): Promise<string> {
  const keys = await getOrCreateVapidKeys()
  return keys.publicKey
}

/**
 * Configure web-push with VAPID keys
 */
async function configureWebPush(): Promise<void> {
  const keys = await getOrCreateVapidKeys()
  const subject = await getVapidSubject()
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey)
}

export interface PushNotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  data?: Record<string, unknown>
  actions?: Array<{ action: string; title: string; icon?: string }>
}

interface PushSubscriptionData {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Send a push notification to a single subscription
 */
async function sendToSubscription(
  subscription: PushSubscriptionData,
  payload: PushNotificationPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    await configureWebPush()

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    }

    // web-push returns a response object with statusCode
    // 201 = Created (success), 200 = OK (success)
    const response = await webpush.sendNotification(pushSubscription, JSON.stringify(payload))

    // Check if response indicates success (2xx status codes)
    if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
      return { success: true }
    }

    // If we get here without throwing, the notification was accepted
    return { success: true }
  } catch (error) {
    // Check if this is a WebPushError with a success status code
    // Some push services return 201 which web-push might handle oddly
    if (error instanceof webpush.WebPushError) {
      // 201 Created is actually success
      if (error.statusCode === 201 || error.statusCode === 200) {
        return { success: true }
      }

      // 410 Gone or 404 Not Found = subscription expired
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Remove invalid subscription
        await prisma.pushSubscription.delete({
          where: { endpoint: subscription.endpoint },
        }).catch(() => {
          // Ignore if already deleted
        })
        console.log('[WEB-PUSH] Removed expired subscription:', subscription.endpoint.slice(0, 50))
        return { success: false, error: 'Subscription expired' }
      }

      console.error('[WEB-PUSH] Push error:', error.statusCode, error.message)
      return { success: false, error: `Push service error: ${error.statusCode}` }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[WEB-PUSH] Send error:', errorMessage)
    return { success: false, error: errorMessage }
  }
}

/**
 * Send push notifications to all subscribed admin devices for an event
 */
export async function sendPushNotifications(
  eventType: NotificationEventType,
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  try {
    const defaultIcon = '/brand/icon-192.svg'
    const defaultBadge = '/brand/icon-192.svg'
    const normalizedPayload = {
      ...payload,
      icon: payload.icon || defaultIcon,
      badge: payload.badge || defaultBadge,
    }

    // Get all subscriptions that include this event type
    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        subscribedEvents: {
          has: eventType,
        },
      },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    })

    if (subscriptions.length === 0) {
      return { sent: 0, failed: 0 }
    }

    let sent = 0
    let failed = 0

    // Send to all subscriptions in parallel
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const result = await sendToSubscription(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          normalizedPayload
        )

        if (result.success) {
          // Update lastUsedAt
          await prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { lastUsedAt: new Date() },
          }).catch(() => {
            // Ignore update errors
          })
        }

        return result
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success) {
        sent++
      } else {
        failed++
      }
    }

    console.log(`[WEB-PUSH] Event ${eventType}: sent=${sent}, failed=${failed}`)
    return { sent, failed }
  } catch (error) {
    console.error('[WEB-PUSH] Failed to send notifications:', error)
    return { sent: 0, failed: 0 }
  }
}

/**
 * Send a test push notification to a specific subscription
 */
export async function sendTestNotification(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  const subscription = await prisma.pushSubscription.findUnique({
    where: { id: subscriptionId },
    select: { endpoint: true, p256dh: true, auth: true, deviceName: true },
  })

  if (!subscription) {
    return { success: false, error: 'Subscription not found' }
  }

  const payload: PushNotificationPayload = {
    title: 'ViTransfer Test',
    body: `Test notification for ${subscription.deviceName || 'this device'}`,
    icon: '/brand/icon-192.svg',
    badge: '/brand/icon-192.svg',
    tag: 'test',
    data: { type: 'TEST' },
  }

  return sendToSubscription(subscription, payload)
}

/**
 * Map notification event types to user-friendly titles and create payloads
 */
export function createNotificationPayload(
  eventType: NotificationEventType,
  data: {
    projectTitle?: string
    videoName?: string
    authorName?: string
    content?: string
    ip?: string
    email?: string
  }
): PushNotificationPayload {
  const basePayload = {
    icon: '/brand/icon-192.svg',
    badge: '/brand/icon-192.svg',
    tag: eventType,
    data: { type: eventType, ...data },
  }

  switch (eventType) {
    case 'FAILED_LOGIN':
      return {
        ...basePayload,
        title: 'Failed Login Attempt',
        body: `Failed login from IP: ${data.ip || 'Unknown'}`,
      }

    case 'UNAUTHORIZED_OTP':
      return {
        ...basePayload,
        title: 'Unauthorized OTP Request',
        body: `OTP request for ${data.email || 'unknown email'} on "${data.projectTitle || 'Unknown project'}"`,
      }

    case 'SHARE_ACCESS':
      return {
        ...basePayload,
        title: 'Project Accessed',
        body: `"${data.projectTitle || 'Unknown project'}" was accessed${data.email ? ` by ${data.email}` : ''}`,
      }

    case 'CLIENT_COMMENT':
      return {
        ...basePayload,
        title: 'New Client Comment',
        body: `${data.authorName || 'A client'} commented on "${data.videoName || data.projectTitle || 'Unknown'}"${data.content ? `: "${data.content.slice(0, 50)}${data.content.length > 50 ? '...' : ''}"` : ''}`,
      }

    case 'VIDEO_APPROVAL':
      return {
        ...basePayload,
        title: 'Video Approved',
        body: `"${data.videoName || 'A video'}" in "${data.projectTitle || 'Unknown project'}" was approved`,
      }

    default:
      return {
        ...basePayload,
        title: 'ViTransfer Notification',
        body: 'You have a new notification',
      }
  }
}
