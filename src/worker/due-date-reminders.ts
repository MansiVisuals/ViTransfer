import { prisma } from '../lib/db'
import { getRedis } from '../lib/redis'
import { enqueueExternalNotification } from '../lib/external-notifications/enqueueExternalNotification'
import { sendDueDateReminderEmail } from '../lib/email'
import { isSmtpConfigured } from '../lib/settings'
import { logError, logMessage } from '../lib/logging'

const REDIS_KEY = 'due_date_reminder:last_check'
let firstRun = true

export async function processDueDateReminders() {
  const redis = getRedis()

  if (firstRun) {
    logMessage('[WORKER] Due date reminder check initialized')
    firstRun = false
  }

  // Only run once per day
  const lastCheck = await redis.get(REDIS_KEY)
  if (lastCheck) {
    const lastCheckDate = new Date(lastCheck)
    const now = new Date()
    if (lastCheckDate.toDateString() === now.toDateString()) {
      return // Already checked today
    }
  }

  logMessage('[WORKER] Running daily due date reminder check...')

  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const nextWeek = new Date(now)
  nextWeek.setDate(nextWeek.getDate() + 7)

  // Find projects due tomorrow with DAY_BEFORE reminder
  const dayBeforeProjects = await prisma.project.findMany({
    where: {
      dueDate: {
        gte: tomorrow,
        lt: new Date(tomorrow.getTime() + 86400000),
      },
      dueReminder: 'DAY_BEFORE',
      status: { notIn: ['APPROVED', 'ARCHIVED'] },
    },
    select: { id: true, title: true, dueDate: true },
  })

  // Find projects due in 7 days with WEEK_BEFORE reminder
  const weekBeforeProjects = await prisma.project.findMany({
    where: {
      dueDate: {
        gte: nextWeek,
        lt: new Date(nextWeek.getTime() + 86400000),
      },
      dueReminder: 'WEEK_BEFORE',
      status: { notIn: ['APPROVED', 'ARCHIVED'] },
    },
    select: { id: true, title: true, dueDate: true },
  })

  const allReminders = [
    ...dayBeforeProjects.map(p => ({ ...p, reminderType: 'tomorrow' })),
    ...weekBeforeProjects.map(p => ({ ...p, reminderType: 'in 7 days' })),
  ]

  if (allReminders.length === 0) {
    await redis.set(REDIS_KEY, new Date().toISOString(), 'EX', 86400)
    logMessage(`[WORKER] Due date check complete — no reminders to send (${dayBeforeProjects.length} day-before, ${weekBeforeProjects.length} week-before)`)
    return
  }

  logMessage(`[WORKER] Found ${allReminders.length} due date reminder(s) to send`)

  let externalFailures = 0
  let emailFailures = 0

  // Send external notifications for each reminder
  for (const project of allReminders) {
    try {
      const dueStr = new Date(project.dueDate!).toLocaleDateString()
      await enqueueExternalNotification({
        eventType: 'DUE_DATE_REMINDER',
        title: `Deadline Reminder: ${project.title}`,
        body: `"${project.title}" is due ${project.reminderType} (${dueStr})`,
      })
    } catch (notificationError) {
      externalFailures++
      logError(`[WORKER] Failed to enqueue due date reminder notification (projectId=${project.id})`, notificationError)
    }
  }

  // Send email reminders to all admins
  try {
    const smtpReady = await isSmtpConfigured()
    if (!smtpReady) {
      logMessage('[WORKER] SMTP not configured — skipping due date reminder emails')
    } else {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { email: true },
      })
      const adminEmails = admins.map(a => a.email).filter(Boolean)

      if (adminEmails.length === 0) {
        logMessage('[WORKER] No admin emails found — skipping due date reminder emails')
      } else {
        for (const project of allReminders) {
          try {
            const dueStr = new Date(project.dueDate!).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
            await sendDueDateReminderEmail({
              adminEmails,
              projectTitle: project.title,
              dueDate: dueStr,
              reminderType: project.reminderType,
            })
          } catch (emailError) {
            emailFailures++
            logError(`[WORKER] Failed to send due date reminder email (projectId=${project.id})`, emailError)
          }
        }
        logMessage(`[WORKER] Sent due date reminder emails to ${adminEmails.length} admin(s)`) 
      }
    }
  } catch (error) {
    emailFailures++
    logError('[WORKER] Failed to send due date reminder emails', error)
  }

  const totalFailures = externalFailures + emailFailures
  if (totalFailures === 0) {
    await redis.set(REDIS_KEY, new Date().toISOString(), 'EX', 86400)
    logMessage(`[WORKER] Due date check complete — ${allReminders.length} reminder(s) processed`)
    return
  }

  await redis.set(REDIS_KEY, new Date().toISOString(), 'EX', 900)
  logMessage(`[WORKER] Due date check completed with ${totalFailures} failure(s); retry scheduled in 15 minutes`)
}
