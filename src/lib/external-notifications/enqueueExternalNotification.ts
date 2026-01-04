import { getExternalNotificationQueue, type ExternalNotificationJob } from '@/lib/queue'

export async function enqueueExternalNotification(job: ExternalNotificationJob): Promise<void> {
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
