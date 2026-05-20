import { prisma } from '../lib/db'
import { secondsToTimecode, parseTimecodeInput, isValidTimecode } from '../lib/timecode'
import { logError, logMessage } from '../lib/logging'

const MAX_ATTEMPTS = 3

/** Get period description string for email template */
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
 * Check if notifications should be sent now (CRON-like scheduling).
 * TZ Note: All Date operations use container's TZ (set via TZ env var in docker-compose).
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
        const [weeklyHour, weeklyMin] = time.split(':').map(Number)
        const weeklyTarget = new Date(now)
        weeklyTarget.setHours(weeklyHour, weeklyMin, 0, 0)
        // Calculate most recent occurrence of the configured day
        const currentDay = now.getDay()
        let daysBack = currentDay - day
        if (daysBack < 0) daysBack += 7
        if (daysBack === 0 && now < weeklyTarget) daysBack = 7
        weeklyTarget.setDate(weeklyTarget.getDate() - daysBack)
        return weeklyTarget

      default:
        return null
    }
  }

  const target = getTargetTime()
  if (!target) return false

  // Not past target time yet
  if (now < target) return false

  if (!lastSent) return true

  // Already sent after this target
  if (lastSent >= target) return false

  return true
}

/**
 * Normalize queued notification payloads to include HH:MM:SS:FF timecode format.
 * Older queue entries stored a numeric timestamp; convert those on the fly.
 */
export function normalizeNotificationDataTimecode(data: any) {
  if (!data) return data

  const normalized = { ...data }

  const normalizeValue = (value: any) => {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (isValidTimecode(trimmed)) return trimmed
      if (!Number.isNaN(Number(trimmed)) && !trimmed.includes(':')) {
        return secondsToTimecode(parseFloat(trimmed), 24)
      }
      try {
        return parseTimecodeInput(trimmed, 24)
      } catch {
        return trimmed
      }
    }
    if (typeof value === 'number') {
      return secondsToTimecode(value, 24)
    }
    return value
  }

  if (!normalized.timecode && normalized.timestamp !== undefined) {
    normalized.timecode = normalizeValue(normalized.timestamp)
  } else if (normalized.timecode) {
    normalized.timecode = normalizeValue(normalized.timecode)
  }

  if (normalized.parentComment) {
    const parent = normalized.parentComment as any
    if (!parent.timecode && parent.timestamp !== undefined) {
      normalized.parentComment = {
        ...parent,
        timecode: normalizeValue(parent.timestamp),
      }
    } else if (parent.timecode) {
      normalized.parentComment = {
        ...parent,
        timecode: normalizeValue(parent.timecode),
      }
    }
  }

  return normalized
}

/**
 * Handle notification send with automatic retry logic.
 * DRY helper used by both admin and client notification processing.
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
    logError(`${logPrefix} Send failed:`, error)
  }

  const now = new Date()

  if (sendSuccess) {
    await prisma.notificationQueue.updateMany({
      where: { id: { in: notificationIds } },
      data: {
        [isClientNotification ? 'sentToClients' : 'sentToAdmins']: true,
        [isClientNotification ? 'clientSentAt' : 'adminSentAt']: now,
        lastError: null
      }
    })
    logMessage(`${logPrefix} Successfully sent`)
  } else if (currentAttempts >= MAX_ATTEMPTS) {
    await prisma.notificationQueue.updateMany({
      where: { id: { in: notificationIds } },
      data: {
        [isClientNotification ? 'clientFailed' : 'adminFailed']: true,
        lastError: lastError || `Failed after ${MAX_ATTEMPTS} attempts`
      }
    })
    logError(`${logPrefix} Permanently failed after ${MAX_ATTEMPTS} attempts`)
  } else {
    await prisma.notificationQueue.updateMany({
      where: { id: { in: notificationIds } },
      data: { lastError: lastError || 'Send failed' }
    })
    logMessage(`${logPrefix} Will retry (attempt ${currentAttempts}/${MAX_ATTEMPTS})`)
  }

  return { success: sendSuccess, lastError }
}
