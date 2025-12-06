import { prisma } from '../lib/db'
import { sendEmail } from '../lib/email'
import { generateNotificationSummaryEmail } from '../lib/email-templates'
import { getProjectRecipients } from '../lib/recipients'
import { generateShareUrl } from '../lib/url'
import { getRedis } from '../lib/redis'
import { getPeriodString, shouldSendNow, sendNotificationsWithRetry, normalizeNotificationDataTimecode } from './notification-helpers'

/**
 * Process client notification summaries
 * Sends notifications to clients for admin replies based on schedule
 */
export async function processClientNotifications() {
  try {
    const now = new Date()
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    console.log(`[CLIENT] Checking for summaries to send (time: ${timeStr})`)

    // Get all projects with pending client notifications
    const projects = await prisma.project.findMany({
      where: {
        notificationQueue: {
          some: {
            sentToClients: false,
            clientFailed: false,
            clientAttempts: { lt: 3 }
          }
        }
      },
      select: {
        id: true,
        title: true,
        slug: true,
        clientNotificationSchedule: true,
        clientNotificationTime: true,
        clientNotificationDay: true,
        lastClientNotificationSent: true,
        notificationQueue: {
          where: {
            sentToClients: false,
            clientFailed: false,
            clientAttempts: { lt: 3 }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (projects.length === 0) {
      console.log('[CLIENT] No projects with pending notifications')
      return
    }

    console.log(`[CLIENT] Found ${projects.length} project(s) with unsent notifications`)

    for (const project of projects) {
      const pending = project.notificationQueue.length
      console.log(`[CLIENT] "${project.title}": ${project.clientNotificationSchedule} at ${project.clientNotificationTime || 'N/A'} (${pending} pending)`)

      if (project.clientNotificationSchedule === 'IMMEDIATE') {
        console.log('[CLIENT]   Skip - IMMEDIATE notifications sent instantly')
        continue
      }

      // Check if it's time to send based on project schedule
      const shouldSend = shouldSendNow(
        project.clientNotificationSchedule,
        project.clientNotificationTime,
        project.clientNotificationDay,
        project.lastClientNotificationSent,
        now
      )

      if (!shouldSend) {
        const lastSentStr = project.lastClientNotificationSent
          ? new Date(project.lastClientNotificationSent).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
          : 'never'
        console.log(`[CLIENT]   Wait - last sent ${lastSentStr}`)
        continue
      }

      console.log(`[CLIENT]   Sending summary now...`)

      if (project.notificationQueue.length === 0) {
        continue
      }

      // Get recipients with notifications enabled
      const allRecipients = await getProjectRecipients(project.id)
      const recipients = allRecipients.filter(r => r.receiveNotifications && r.email)

      if (recipients.length === 0) {
        console.log(`[CLIENT]   No recipients with notifications enabled, skipping`)
        continue
      }

      const period = getPeriodString(project.clientNotificationSchedule)
      const shareUrl = await generateShareUrl(project.slug)

      // Filter out cancelled notifications
      const redis = getRedis()
      const validNotifications = []
      const cancelledNotificationIds = []

      for (const notification of project.notificationQueue) {
        const commentId = (notification.data as any).commentId
        if (commentId) {
          const notificationData = await redis.get(`comment_notification:${commentId}`)
          if (!notificationData) {
            console.log(`[CLIENT]   Skipping cancelled notification for comment ${commentId}`)
            cancelledNotificationIds.push(notification.id)
            continue
          }
        }
        validNotifications.push(notification)
      }

      // Clean up cancelled notifications from queue
      if (cancelledNotificationIds.length > 0) {
        await prisma.notificationQueue.deleteMany({
          where: { id: { in: cancelledNotificationIds } }
        })
        console.log(`[CLIENT]   Removed ${cancelledNotificationIds.length} cancelled notification(s)`)
      }

      if (validNotifications.length === 0) {
        console.log(`[CLIENT]   No valid notifications to send (all cancelled)`)
        continue
      }

      const notificationIds = validNotifications.map(n => n.id)

      // Increment attempt counter before sending
      await prisma.notificationQueue.updateMany({
        where: { id: { in: notificationIds } },
        data: { clientAttempts: { increment: 1 } }
      })

      const currentAttempts = project.notificationQueue[0]?.clientAttempts + 1 || 1
      console.log(`[CLIENT]   Attempt #${currentAttempts} for ${project.notificationQueue.length} notification(s)`)

      // Send summary to each recipient
      const result = await sendNotificationsWithRetry({
        notificationIds,
        currentAttempts,
        isClientNotification: true,
        logPrefix: '[CLIENT]  ',
        onSuccess: async () => {
          const notifications = validNotifications.map(n =>
            normalizeNotificationDataTimecode(n.data as any)
          )

          for (const recipient of recipients) {
            const html = generateNotificationSummaryEmail({
              projectTitle: project.title,
              shareUrl,
              recipientName: recipient.name || recipient.email!,
              recipientEmail: recipient.email!,
              period,
              notifications
            })

            const result = await sendEmail({
              to: recipient.email!,
              subject: `Updates on ${project.title}`,
              html,
            })

            if (result.success) {
              console.log(`[CLIENT]     Sent to ${recipient.name || recipient.email}`)
            } else {
              throw new Error(`Failed to send to ${recipient.email}: ${result.error}`)
            }
          }
        }
      })

      // Update project last sent timestamp on success
      if (result.success) {
        await prisma.project.update({
          where: { id: project.id },
          data: { lastClientNotificationSent: now }
        })
        console.log(`[CLIENT]   Summary sent (${project.notificationQueue.length} items to ${recipients.length} recipient(s))`)
      }
    }

    console.log('[CLIENT] Check completed')
  } catch (error) {
    console.error('[CLIENT] Error processing notifications:', error)
  }
}
