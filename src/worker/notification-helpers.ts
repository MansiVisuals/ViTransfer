import { prisma } from '../lib/db'

const MAX_ATTEMPTS = 3

/**
 * Get period description string for email template
 */
export function getPeriodString(schedule: string): string {
  switch (schedule) {
    case 'HOURLY':
      return 'in the last hour'
    case 'DAILY':
      return 'today'
    case 'WEEKLY':
      return 'this week'
    default:
      return 'recently'
  }
}

/**
 * Check if notifications should be sent now (CRON-like scheduling)
 *
 * CRON Principle: Compares last sent time against the most recent target time.
 * If schedule changes (e.g., WEEKLY→DAILY), immediately re-evaluates and sends if past due.
 *
 * TZ Note: All Date operations use container's TZ (set via TZ env var in docker-compose)
 */
export function shouldSendNow(
  schedule: string,
  time: string | null,
  day: number | null,
  lastSent: Date | null,
  now: Date
): boolean {
  const getTargetTime = (): Date | null => {
    switch (schedule) {
      case 'HOURLY':
        // Only send at the top of the hour (:00 or :01 minutes to account for cron timing)
        // This ensures messages accumulate during the hour and send at the next :00
        if (now.getMinutes() > 1) return null

        // Target is the current hour (already at :00 or :01)
        const hourTarget = new Date(now)
        hourTarget.setMinutes(0, 0, 0)
        return hourTarget

      case 'DAILY':
        if (!time) return null
        const [dailyHour, dailyMin] = time.split(':').map(Number)
        const dailyTarget = new Date(now)
        dailyTarget.setHours(dailyHour, dailyMin, 0, 0)
        return dailyTarget

      case 'WEEKLY':
        if (!time || day === null) return null
        if (now.getDay() !== day) return null
        const [weeklyHour, weeklyMin] = time.split(':').map(Number)
        const weeklyTarget = new Date(now)
        weeklyTarget.setHours(weeklyHour, weeklyMin, 0, 0)
        return weeklyTarget

      default:
        return null
    }
  }

  const target = getTargetTime()
  if (!target) return false

  // Not past target time yet - wait
  if (now < target) return false

  // Never sent before - send now
  if (!lastSent) return true

  // Already sent after this target - don't send again
  if (lastSent >= target) return false

  // Last sent was before this target - send now
  return true
}

/**
 * Handle notification send with automatic retry logic
 * DRY helper - used by both admin and client notification processing
 */
export async function sendNotificationsWithRetry(config: {
  notificationIds: string[]
  currentAttempts: number
  isClientNotification: boolean
  onSuccess: () => Promise<void>
  logPrefix: string
}): Promise<{ success: boolean; lastError?: string }> {
  const { notificationIds, currentAttempts, isClientNotification, onSuccess, logPrefix } = config

  let sendSuccess = false
  let lastError: string | undefined

  try {
    await onSuccess()
    sendSuccess = true
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Unknown error'
    console.error(`${logPrefix} Send failed:`, error)
  }

  const now = new Date()

  if (sendSuccess) {
    // Mark as sent
    await prisma.notificationQueue.updateMany({
      where: { id: { in: notificationIds } },
      data: {
        [isClientNotification ? 'sentToClients' : 'sentToAdmins']: true,
        [isClientNotification ? 'clientSentAt' : 'adminSentAt']: now,
        lastError: null
      }
    })
    console.log(`${logPrefix} Successfully sent`)
  } else if (currentAttempts >= MAX_ATTEMPTS) {
    // Permanently failed after 3 attempts
    await prisma.notificationQueue.updateMany({
      where: { id: { in: notificationIds } },
      data: {
        [isClientNotification ? 'clientFailed' : 'adminFailed']: true,
        lastError: lastError || `Failed after ${MAX_ATTEMPTS} attempts`
      }
    })
    console.error(`${logPrefix} Permanently failed after ${MAX_ATTEMPTS} attempts`)
  } else {
    // Will retry
    await prisma.notificationQueue.updateMany({
      where: { id: { in: notificationIds } },
      data: { lastError: lastError || 'Send failed' }
    })
    console.log(`${logPrefix} Will retry (attempt ${currentAttempts}/${MAX_ATTEMPTS})`)
  }

  return { success: sendSuccess, lastError }
}
