import { prisma } from '../lib/db'
import { getRedis } from '../lib/redis'
import { enqueueExternalNotification } from '../lib/external-notifications/enqueueExternalNotification'

const REDIS_KEY = 'due_date_reminder:last_check'

export async function processDueDateReminders() {
  const redis = getRedis()

  // Only run once per day
  const lastCheck = await redis.get(REDIS_KEY)
  if (lastCheck) {
    const lastCheckDate = new Date(lastCheck)
    const now = new Date()
    if (lastCheckDate.toDateString() === now.toDateString()) {
      return // Already checked today
    }
  }

  await redis.set(REDIS_KEY, new Date().toISOString(), 'EX', 86400)

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

  if (allReminders.length === 0) return

  // Send external notifications for each reminder
  for (const project of allReminders) {
    const dueStr = new Date(project.dueDate!).toLocaleDateString()
    await enqueueExternalNotification({
      eventType: 'DUE_DATE_REMINDER',
      title: `Deadline Reminder: ${project.title}`,
      body: `"${project.title}" is due ${project.reminderType} (${dueStr})`,
    })
  }

  console.log(`[WORKER] Sent ${allReminders.length} due date reminder(s)`)
}
