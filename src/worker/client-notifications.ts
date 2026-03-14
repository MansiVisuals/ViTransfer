import { prisma } from '../lib/db'
import { getEmailSettings, getRecipientLocale, sendEmail } from '../lib/email'
import { generateNotificationSummaryEmail } from '../lib/email-templates'
import { getProjectRecipients } from '../lib/recipients'
import { generateShareUrl } from '../lib/url'
import { getRedis } from '../lib/redis'
import { buildUnsubscribeUrl, generateRecipientUnsubscribeToken } from '../lib/unsubscribe'
import { getPeriodString, shouldSendNow, sendNotificationsWithRetry, normalizeNotificationDataTimecode } from './notification-helpers'
import { logError, logMessage } from '../lib/logging'

/**
 * Process client notification summaries
 * Sends notifications to clients for admin replies based on schedule
 */
export async function processClientNotifications() {
  try {
    const emailSettings = await getEmailSettings()
    const companyName = emailSettings.companyName || 'ViTransfer'

    const now = new Date()
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    logMessage(`[CLIENT] Checking for summaries to send (time: ${timeStr})`)

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
      logMessage('[CLIENT] No projects with pending notifications')
      return
    }

    logMessage(`[CLIENT] Found ${projects.length} project(s) with unsent notifications`)

    for (const project of projects) {
      const pending = project.notificationQueue.length
      logMessage(`[CLIENT] "${project.title}": ${project.clientNotificationSchedule} at ${project.clientNotificationTime || 'N/A'} (${pending} pending)`)

      if (project.clientNotificationSchedule === 'IMMEDIATE') {
        logMessage('[CLIENT]   Skip - IMMEDIATE notifications sent instantly')
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
        logMessage(`[CLIENT]   Wait - last sent ${lastSentStr}`)
        continue
      }

      logMessage(`[CLIENT]   Sending summary now...`)

      if (project.notificationQueue.length === 0) {
        continue
      }

      // Get recipients with notifications enabled
      const allRecipients = await getProjectRecipients(project.id)
      const recipients = allRecipients.filter(r => r.receiveNotifications && r.email)

      if (recipients.length === 0) {
        logMessage(`[CLIENT]   No recipients with notifications enabled, skipping`)
        continue
      }

      const period = getPeriodString(project.clientNotificationSchedule)
      const shareUrl = await generateShareUrl(project.slug)

      // Filter out cancelled notifications
      const redis = getRedis()
      const validNotifications: typeof project.notificationQueue = []
      const cancelledNotificationIds: string[] = []

      for (const notification of project.notificationQueue) {
        const commentId = (notification.data as any).commentId
        if (commentId) {
          const isCancelled = await redis.get(`comment_cancelled:${commentId}`)
          if (isCancelled) {
            logMessage(`[CLIENT]   Skipping cancelled notification for comment ${commentId}`)
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
        logMessage(`[CLIENT]   Removed ${cancelledNotificationIds.length} cancelled notification(s)`)
      }

      if (validNotifications.length === 0) {
        logMessage(`[CLIENT]   No valid notifications to send (all cancelled)`)
        continue
      }

      const notificationIds = validNotifications.map(n => n.id)

      // Increment attempt counter before sending
      await prisma.notificationQueue.updateMany({
        where: { id: { in: notificationIds } },
        data: { clientAttempts: { increment: 1 } }
      })

      const currentAttempts = project.notificationQueue[0]?.clientAttempts + 1 || 1
      logMessage(`[CLIENT]   Attempt #${currentAttempts} for ${project.notificationQueue.length} notification(s)`)

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
            let unsubscribeUrl: string | undefined
            try {
              const token = generateRecipientUnsubscribeToken({
                recipientId: recipient.id!,
                projectId: project.id,
                recipientEmail: recipient.email!,
              })
              unsubscribeUrl = buildUnsubscribeUrl(new URL(shareUrl).origin, token)
            } catch {
              unsubscribeUrl = undefined
            }

            const summaryEmail = await generateNotificationSummaryEmail({
              companyName,
              accentColor: emailSettings.accentColor || undefined,
              projectTitle: project.title,
              shareUrl,
              recipientName: recipient.name || recipient.email!,
              recipientEmail: recipient.email!,
              period,
              notifications,
              unsubscribeUrl,
              locale: await getRecipientLocale(recipient.email!),
            })

            const result = await sendEmail({
              to: recipient.email!,
              subject: summaryEmail.subject,
              html: summaryEmail.html,
            })

            if (result.success) {
              logMessage(`[CLIENT]     Sent to ${recipient.name || recipient.email}`)
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
        logMessage(`[CLIENT]   Summary sent (${project.notificationQueue.length} items to ${recipients.length} recipient(s))`)
      }
    }

    logMessage('[CLIENT] Check completed')
  } catch (error) {
    logError('[CLIENT] Error processing notifications:', error)
  }
}
