import { getExternalNotificationQueue, type ExternalNotificationJob } from '@/lib/queue'
import { sendPushNotifications, createNotificationPayload } from '@/lib/push-notifications'
import type { NotificationEventType } from './constants'

// Extended job interface with push notification data
interface ExtendedNotificationJob extends ExternalNotificationJob {
  // Additional data for push notification formatting
  pushData?: {
    projectTitle?: string
    videoName?: string
    authorName?: string
    content?: string
    ip?: string
    email?: string
    projectId?: string
    url?: string
    title?: string
    body?: string
  }
}

export async function enqueueExternalNotification(job: ExtendedNotificationJob): Promise<void> {
  // Send push notifications in parallel with queue (fire and forget)
  const sendPush = async () => {
    try {
      const eventType = job.eventType as NotificationEventType

      // Parse data from body if pushData not provided
      let pushData = job.pushData || {}

      // Try to extract info from body for common patterns
      if (!pushData.projectTitle && job.body) {
        const projectMatch = job.body.match(/Project:\s*(.+?)(?:\n|$)/)
        if (projectMatch) pushData.projectTitle = projectMatch[1].trim()
      }
      if (!pushData.videoName && job.body) {
        const videoMatch = job.body.match(/Video:\s*(.+?)(?:\n|$)/)
        if (videoMatch) pushData.videoName = videoMatch[1].trim()
      }
      if (!pushData.email && job.body) {
        const emailMatch = job.body.match(/(?:Email|Client):\s*(.+?)(?:\n|$)/)
        if (emailMatch) pushData.email = emailMatch[1].trim()
      }
      if (!pushData.authorName && job.body) {
        const authorMatch = job.body.match(/Client:\s*([^(]+?)(?:\s*\(|$|\n)/)
        if (authorMatch) pushData.authorName = authorMatch[1].trim()
      }
      if (!pushData.content && job.body) {
        const commentMatch = job.body.match(/Comment:\s*(.+?)(?:\n|$)/)
        if (commentMatch) pushData.content = commentMatch[1].trim()
      }

      const payload = createNotificationPayload(eventType, {
        projectTitle: pushData.projectTitle,
        videoName: pushData.videoName,
        authorName: pushData.authorName,
        content: pushData.content,
        ip: pushData.ip,
        email: pushData.email,
        title: pushData.title,
        body: pushData.body,
      })

      // Add project ID and URL to payload data for click handling
      if (pushData.projectId || pushData.url) {
        payload.data = {
          ...payload.data,
          ...(pushData.projectId && { projectId: pushData.projectId }),
          ...(pushData.url && { url: pushData.url }),
        }
      }

      await sendPushNotifications(eventType, payload)
    } catch (error) {
      // Don't fail the main notification if push fails
      console.error('[PUSH-NOTIFICATIONS] Failed to send push:', error)
    }
  }

  // Run push notification in background
  void sendPush()

  // Queue external notification (Apprise)
  try {
    const queue = getExternalNotificationQueue()
    await queue.add('send', job)
  } catch (error) {
    console.error('[EXTERNAL-NOTIFICATIONS] Failed to enqueue job', {
      eventType: job.eventType,
      destinationCount: job.destinationIds?.length || 0,
    })
    throw error
  }
}
