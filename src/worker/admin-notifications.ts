import { prisma } from '../lib/db'
import { sendEmail } from '../lib/email'
import { generateAdminSummaryEmail } from '../lib/email-templates'
import { generateShareUrl } from '../lib/url'
import { getPeriodString, shouldSendNow, sendNotificationsWithRetry, normalizeNotificationDataTimecode } from './notification-helpers'

/**
 * Process admin notification summaries
 * Sends notifications to admins for client comments based on schedule
 */
export async function processAdminNotifications() {
  try {
    // Get admin notification settings
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        adminNotificationSchedule: true,
        adminNotificationTime: true,
        adminNotificationDay: true,
        lastAdminNotificationSent: true,
      }
    })

    if (!settings || settings.adminNotificationSchedule === 'IMMEDIATE') {
      console.log('[ADMIN] Admin schedule is IMMEDIATE - notifications sent in real-time')
      return
    }

    const now = new Date()
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    console.log(`[ADMIN] Checking for admin notifications to send (time: ${timeString})`)
    console.log(`[ADMIN]   Schedule: ${settings.adminNotificationSchedule}`)
    console.log(`[ADMIN]   Target time: ${settings.adminNotificationTime || 'N/A'}`)
    console.log(`[ADMIN]   Last sent: ${settings.lastAdminNotificationSent ? new Date(settings.lastAdminNotificationSent).toISOString() : 'Never'}`)

    // Check if it's time to send based on schedule
    const shouldSend = shouldSendNow(
      settings.adminNotificationSchedule,
      settings.adminNotificationTime,
      settings.adminNotificationDay,
      settings.lastAdminNotificationSent,
      now
    )

    if (!shouldSend) {
      console.log(`[ADMIN] Not time to send yet - waiting for schedule`)
      return
    }

    console.log(`[ADMIN] Time to send! Checking for pending notifications...`)

    // Get pending admin notifications
    const pendingNotifications = await prisma.notificationQueue.findMany({
      where: {
        sentToAdmins: false,
        adminFailed: false,
        adminAttempts: { lt: 3 }
      },
      include: {
        project: {
          select: { title: true, slug: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    })

    if (pendingNotifications.length === 0) {
      console.log(`[ADMIN] No pending notifications found`)
      return
    }

    console.log(`[ADMIN] Found ${pendingNotifications.length} pending notification(s)`)

    // Group notifications by project
    const projectGroups: Record<string, any> = {}
    for (const notification of pendingNotifications) {
      const projectId = notification.projectId
      if (!projectGroups[projectId]) {
        projectGroups[projectId] = {
          projectTitle: notification.project.title,
          shareUrl: await generateShareUrl(notification.project.slug),
          notifications: []
        }
      }
      projectGroups[projectId].notifications.push(
        normalizeNotificationDataTimecode(notification.data)
      )
    }

    // Get all admins
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { email: true, name: true }
    })

    if (admins.length === 0) {
      console.log('No admin users found, skipping notification summary')
      return
    }

    const period = getPeriodString(settings.adminNotificationSchedule)
    const notificationIds = pendingNotifications.map(n => n.id)

    // Increment attempt counter before sending
    await prisma.notificationQueue.updateMany({
      where: { id: { in: notificationIds } },
      data: { adminAttempts: { increment: 1 } }
    })

    const currentAttempts = pendingNotifications[0]?.adminAttempts + 1 || 1
    console.log(`[ADMIN] Attempt #${currentAttempts} for ${pendingNotifications.length} notification(s)`)

    // Send summary to each admin
    const result = await sendNotificationsWithRetry({
      notificationIds,
      currentAttempts,
      isClientNotification: false,
      logPrefix: '[ADMIN]',
      onSuccess: async () => {
        const projects = Object.values(projectGroups)

        for (const admin of admins) {
          const html = generateAdminSummaryEmail({
            adminName: admin.name || '',
            period,
            projects
          })

          const result = await sendEmail({
            to: admin.email,
            subject: `Project activity summary (${pendingNotifications.length} updates)`,
            html,
          })

          if (result.success) {
            console.log(`[ADMIN]   Sent to ${admin.email}`)
          } else {
            throw new Error(`Failed to send to ${admin.email}: ${result.error}`)
          }
        }
      }
    })

    // Update settings last sent timestamp on success
    if (result.success) {
      await prisma.settings.update({
        where: { id: 'default' },
        data: { lastAdminNotificationSent: now }
      })
      console.log(`[ADMIN] Summary sent (${pendingNotifications.length} notifications to ${admins.length} admins)`)
    }
  } catch (error) {
    console.error('Failed to process admin notifications:', error)
  }
}
