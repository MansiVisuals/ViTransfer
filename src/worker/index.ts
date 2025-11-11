import { Worker, Job, Queue } from 'bullmq'
import { getConnection, VideoProcessingJob } from '../lib/queue'
import { prisma } from '../lib/db'
import { downloadFile, uploadFile, initStorage } from '../lib/storage'
import { transcodeVideo, generateThumbnail, getVideoMetadata } from '../lib/ffmpeg'
import { runCleanup } from '../lib/upload-cleanup'
import { sendEmail } from '../lib/email'
import { generateNotificationSummaryEmail, generateAdminSummaryEmail } from '../lib/email-templates'
import { getProjectRecipients } from '../lib/recipients'
import { generateShareUrl } from '../lib/url'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { pipeline } from 'stream/promises'

const TEMP_DIR = '/tmp/vitransfer'

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
}

// Helper function to cleanup old temp files (prevents disk space issues)
async function cleanupOldTempFiles() {
  try {
    const files = await fs.promises.readdir(TEMP_DIR)
    const now = Date.now()
    const maxAge = 2 * 60 * 60 * 1000 // 2 hours

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file)
      try {
        const stats = await fs.promises.stat(filePath)
        const age = now - stats.mtimeMs

        // Delete files older than 2 hours (likely from failed jobs)
        if (age > maxAge) {
          await fs.promises.unlink(filePath)
          console.log(`Cleaned up old temp file: ${file} (${(age / 1000 / 60).toFixed(0)} minutes old)`)
        }
      } catch (err) {
        // File might have been deleted already, skip
      }
    }
  } catch (error) {
    console.error('Failed to cleanup old temp files:', error)
  }
}

async function processVideo(job: Job<VideoProcessingJob>) {
  const { videoId, originalStoragePath, projectId } = job.data

  console.log(`Processing video ${videoId}`)

  // Declare temp paths outside try block for cleanup in catch
  let tempInputPath: string | undefined
  let tempPreviewPath: string | undefined
  let tempThumbnailPath: string | undefined

  try {
    // Update status to processing
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'PROCESSING', processingProgress: 0 },
    })

    // Download original file to temp location
    tempInputPath = path.join(TEMP_DIR, `${videoId}-original`)
    const downloadStream = await downloadFile(originalStoragePath)
    await pipeline(downloadStream, fs.createWriteStream(tempInputPath))

    console.log(`Downloaded original file for video ${videoId}`)

    // Verify file exists and has content
    const stats = fs.statSync(tempInputPath)
    if (stats.size === 0) {
      throw new Error('Downloaded file is empty')
    }

    console.log(`Downloaded file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)

    // Get video metadata
    const metadata = await getVideoMetadata(tempInputPath)
    console.log(`Video metadata:`, metadata)

    // Get project and video details for watermark and settings
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        title: true,
        previewResolution: true,
        watermarkEnabled: true,
        watermarkText: true,
      },
    })

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { versionLabel: true },
    })

    // Use custom watermark text or default format (only if watermarks are enabled)
    const watermarkText = project?.watermarkEnabled
      ? (project.watermarkText || `PREVIEW-${project.title || 'PROJECT'}-${video?.versionLabel || 'v1'}`)
      : undefined

    // Detect if video is vertical (portrait) or horizontal (landscape)
    const isVertical = metadata.height > metadata.width
    const aspectRatio = metadata.width / metadata.height

    console.log(`Video orientation: ${isVertical ? 'vertical' : 'horizontal'} (${metadata.width}x${metadata.height}, ratio: ${aspectRatio.toFixed(2)})`)

    // Calculate output dimensions based on resolution setting and orientation
    let outputWidth: number
    let outputHeight: number

    const resolution = project?.previewResolution || '720p'

    if (resolution === '720p') {
      if (isVertical) {
        // For vertical videos, 720p means 720 width (portrait)
        outputWidth = 720
        // Ensure height is even (required for H.264 encoding)
        outputHeight = Math.round(720 / aspectRatio / 2) * 2
      } else {
        // For horizontal videos, 720p means 1280x720
        outputWidth = 1280
        outputHeight = 720
      }
    } else {
      // 1080p
      if (isVertical) {
        // For vertical videos, 1080p means 1080 width (portrait)
        outputWidth = 1080
        // Ensure height is even (required for H.264 encoding)
        outputHeight = Math.round(1080 / aspectRatio / 2) * 2
      } else {
        // For horizontal videos, 1080p means 1920x1080
        outputWidth = 1920
        outputHeight = 1080
      }
    }

    console.log(`Output resolution: ${outputWidth}x${outputHeight}`)

    // Generate preview with watermark
    tempPreviewPath = path.join(TEMP_DIR, `${videoId}-preview.mp4`)
    await transcodeVideo({
      inputPath: tempInputPath,
      outputPath: tempPreviewPath,
      width: outputWidth,
      height: outputHeight,
      watermarkText,
      onProgress: async (progress) => {
        await prisma.video.update({
          where: { id: videoId },
          data: { processingProgress: progress * 0.8 },
        })
      },
    })

    console.log(`Generated ${resolution} preview for video ${videoId}`)

    // Upload preview
    const previewPath = `projects/${projectId}/videos/${videoId}/preview-${resolution}.mp4`
    const statsPreview = fs.statSync(tempPreviewPath)
    await uploadFile(
      previewPath,
      fs.createReadStream(tempPreviewPath),
      statsPreview.size,
      'video/mp4'
    )

    // Generate thumbnail
    tempThumbnailPath = path.join(TEMP_DIR, `${videoId}-thumb.jpg`)
    await generateThumbnail(tempInputPath, tempThumbnailPath, 10)

    console.log(`Generated thumbnail for video ${videoId}`)

    // Upload thumbnail
    const thumbnailPath = `projects/${projectId}/videos/${videoId}/thumbnail.jpg`
    const statsThumbnail = fs.statSync(tempThumbnailPath)
    await uploadFile(
      thumbnailPath,
      fs.createReadStream(tempThumbnailPath),
      statsThumbnail.size,
      'image/jpeg'
    )

    // Update video record - store preview in appropriate field based on resolution
    const updateData: any = {
      status: 'READY',
      processingProgress: 100,
      thumbnailPath,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
      codec: metadata.codec,
    }

    // Store preview path in correct field
    if (resolution === '720p') {
      updateData.preview720Path = previewPath
    } else {
      updateData.preview1080Path = previewPath
    }

    await prisma.video.update({
      where: { id: videoId },
      data: updateData,
    })

    // Cleanup temp files with proper async error handling
    const cleanupFiles = [tempInputPath, tempPreviewPath, tempThumbnailPath]
    for (const file of cleanupFiles) {
      try {
        if (fs.existsSync(file)) {
          await fs.promises.unlink(file)
          console.log(`Cleaned up temp file: ${path.basename(file)}`)
        }
      } catch (cleanupError) {
        console.error(`Failed to cleanup temp file ${path.basename(file)}:`, cleanupError)
        // Continue cleanup - don't let one failure stop the others
      }
    }

    console.log(`Successfully processed video ${videoId}`)
  } catch (error) {
    console.error(`Error processing video ${videoId}:`, error)

    // Cleanup temp files even on error
    const cleanupFiles = [tempInputPath, tempPreviewPath, tempThumbnailPath].filter((f): f is string => !!f)
    for (const file of cleanupFiles) {
      try {
        if (fs.existsSync(file)) {
          await fs.promises.unlink(file)
        }
      } catch (cleanupError) {
        console.error(`Failed to cleanup temp file after error:`, cleanupError)
      }
    }

    // Update video with error
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'ERROR',
        processingError: error instanceof Error ? error.message : 'Unknown error',
      },
    })

    throw error
  }
}

/**
 * Process admin notification summaries
 * Sends notifications to admins for client comments based on schedule
 */
async function processAdminNotifications() {
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
      return // No batch processing for IMMEDIATE
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

    // Get pending admin notifications (all activity)
    // Send ALL comments to admins: client comments AND admin replies (for complete context)
    // Exclude permanently failed and limit retries to 3 attempts
    const pendingNotifications = await prisma.notificationQueue.findMany({
      where: {
        sentToAdmins: false,
        adminFailed: false, // Exclude permanently failed
        adminAttempts: { lt: 3 } // Max 3 attempts
        // No type filter - include ALL comment types for complete discussion context
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
      return // Nothing to send
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
      projectGroups[projectId].notifications.push(notification.data)
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
      data: {
        adminAttempts: { increment: 1 }
      }
    })

    console.log(`[ADMIN] Attempt #${pendingNotifications[0]?.adminAttempts + 1 || 1} for ${pendingNotifications.length} notification(s)`)

    let sendSuccess = false
    let lastError: string | undefined

    // Send summary to each admin
    for (const admin of admins) {
      try {
        const projects = Object.values(projectGroups)
        if (projects.length > 0 && projects[0].notifications.length > 0) {
          console.log(`[ADMIN]   Notification data sample:`, JSON.stringify(projects[0].notifications[0], null, 2))
        }

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
          sendSuccess = true
          console.log(`[ADMIN] Sent admin summary (${pendingNotifications.length} notifications to ${admin.email})`)
        } else {
          lastError = result.error || 'Unknown error'
          console.error(`[ADMIN] Failed to send to ${admin.email}: ${lastError}`)
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[ADMIN] Failed to send admin summary:`, error)
        // Continue sending to other admins
      }
    }

    if (sendSuccess) {
      // Mark as sent to admins
      await prisma.notificationQueue.updateMany({
        where: { id: { in: notificationIds } },
        data: {
          sentToAdmins: true,
          adminSentAt: now,
          lastError: null // Clear error on success
        }
      })

      // Update last sent timestamp
      await prisma.settings.update({
        where: { id: 'default' },
        data: { lastAdminNotificationSent: now }
      })

      console.log(`[ADMIN] Summary sent (${pendingNotifications.length} notifications to ${admins.length} admins)`)
    } else {
      // Check if we've exhausted retries
      const maxAttempts = 3
      const currentAttempts = pendingNotifications[0]?.adminAttempts + 1 || 1

      if (currentAttempts >= maxAttempts) {
        // Mark as permanently failed after 3 attempts
        await prisma.notificationQueue.updateMany({
          where: { id: { in: notificationIds } },
          data: {
            adminFailed: true,
            lastError: lastError || 'Failed after 3 attempts'
          }
        })
        console.error(`[ADMIN] Permanently failed after ${maxAttempts} attempts`)
      } else {
        // Update error for retry
        await prisma.notificationQueue.updateMany({
          where: { id: { in: notificationIds } },
          data: {
            lastError: lastError || 'Send failed'
          }
        })
        console.log(`[ADMIN] Will retry (attempt ${currentAttempts}/${maxAttempts})`)
      }
    }
  } catch (error) {
    console.error('Failed to process admin notifications:', error)
  }
}

/**
 * Process client notification summaries
 * Sends notifications to clients for admin replies based on schedule
 */
async function processClientNotifications() {
  try {
    const now = new Date()
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    console.log(`[CLIENT] Checking for summaries to send (time: ${timeStr})`)

    // Get all projects with pending client notifications
    // Send ALL activity to clients: admin replies AND all comments
    // NOTE: Approvals are always sent immediately and never queued
    const projects = await prisma.project.findMany({
      where: {
        notificationQueue: {
          some: {
            sentToClients: false,
            clientFailed: false, // Exclude permanently failed
            clientAttempts: { lt: 3 } // Max 3 attempts
            // No type filter - send ALL comments to clients
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
            // No type filter - include ALL comment types
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (projects.length === 0) {
      console.log('[CLIENT] No projects with pending notifications')
      return // Nothing to send
    }

    console.log(`[CLIENT] Found ${projects.length} project(s) with unsent notifications`)

    for (const project of projects) {
      const pending = project.notificationQueue.length
      console.log(`[CLIENT] "${project.title}": ${project.clientNotificationSchedule} at ${project.clientNotificationTime || 'N/A'} (${pending} pending)`)

      if (project.clientNotificationSchedule === 'IMMEDIATE') {
        console.log('[CLIENT]   Skip - IMMEDIATE notifications sent instantly')
        continue // No batch processing for IMMEDIATE
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
      const notificationIds = project.notificationQueue.map(n => n.id)

      // Increment attempt counter before sending
      await prisma.notificationQueue.updateMany({
        where: { id: { in: notificationIds } },
        data: {
          clientAttempts: { increment: 1 }
        }
      })

      const currentAttempts = project.notificationQueue[0]?.clientAttempts + 1 || 1
      console.log(`[CLIENT]   Attempt #${currentAttempts} for ${project.notificationQueue.length} notification(s)`)

      let sendSuccess = false
      let lastError: string | undefined

      // Send summary to each recipient
      for (const recipient of recipients) {
        try {
          const notifications = project.notificationQueue.map(n => n.data as any)
          console.log(`[CLIENT]     Notification data sample:`, JSON.stringify(notifications[0], null, 2))

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
            sendSuccess = true
            console.log(`[CLIENT]     Sent to ${recipient.name || recipient.email}`)
          } else {
            lastError = result.error || 'Unknown error'
            console.error(`[CLIENT]     Failed to send to ${recipient.email}: ${lastError}`)
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Unknown error'
          console.error(`[CLIENT]     Failed to send to ${recipient.email}:`, error)
          // Continue sending to other recipients
        }
      }

      if (sendSuccess) {
        // Mark as sent to clients
        await prisma.notificationQueue.updateMany({
          where: { id: { in: notificationIds } },
          data: {
            sentToClients: true,
            clientSentAt: now,
            lastError: null // Clear error on success
          }
        })

        // Update last sent timestamp
        await prisma.project.update({
          where: { id: project.id },
          data: { lastClientNotificationSent: now }
        })

        console.log(`[CLIENT]   Summary sent (${project.notificationQueue.length} items to ${recipients.length} recipient(s))`)
      } else {
        // Check if we've exhausted retries
        const maxAttempts = 3

        if (currentAttempts >= maxAttempts) {
          // Mark as permanently failed after 3 attempts
          await prisma.notificationQueue.updateMany({
            where: { id: { in: notificationIds } },
            data: {
              clientFailed: true,
              lastError: lastError || 'Failed after 3 attempts'
            }
          })
          console.error(`[CLIENT]   Permanently failed after ${maxAttempts} attempts`)
        } else {
          // Update error for retry
          await prisma.notificationQueue.updateMany({
            where: { id: { in: notificationIds } },
            data: {
              lastError: lastError || 'Send failed'
            }
          })
          console.log(`[CLIENT]   Will retry (attempt ${currentAttempts}/${maxAttempts})`)
        }
      }
    }

    console.log('[CLIENT] Check completed')
  } catch (error) {
    console.error('[CLIENT] Error processing notifications:', error)
  }
}

/**
 * Get period description string for email template
 */
function getPeriodString(schedule: string): string {
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
 * Check if notifications should be sent now (flexible cron-like scheduling)
 * Key principle: If schedule changes, immediately re-evaluate based on new schedule
 *
 * HOURLY: Send every hour at :00 (10:00, 11:00, 12:00, etc.)
 * DAILY: Send once per day at specified time
 * WEEKLY: Send once per week on specified day and time
 */
function shouldSendNow(
  schedule: string,
  time: string | null,
  day: number | null,
  lastSent: Date | null,
  now: Date
): boolean {
  switch (schedule) {
    case 'HOURLY':
      // Send every hour at :00
      // Allow 2-minute window to catch the :00 mark (worker runs every minute)
      const currentMinute = now.getMinutes()
      if (currentMinute > 2) return false

      // Calculate the start of current hour
      const currentHourStart = new Date(now)
      currentHourStart.setMinutes(0, 0, 0)

      // If never sent, or last sent was before this hour started, send
      if (!lastSent || lastSent < currentHourStart) return true
      return false

    case 'DAILY':
      if (!time) return false
      const [dailyHour, dailyMin] = time.split(':').map(Number)
      const targetDailyMinutes = dailyHour * 60 + dailyMin
      const currentDailyMinutes = now.getHours() * 60 + now.getMinutes()

      // Haven't reached the target time yet today
      if (currentDailyMinutes < targetDailyMinutes) return false

      // Calculate today's target time
      const todayTarget = new Date(now)
      todayTarget.setHours(dailyHour, dailyMin, 0, 0)

      // If never sent, or last sent was before today's target time, send
      if (!lastSent || lastSent < todayTarget) return true
      return false

    case 'WEEKLY':
      if (!time || day === null) return false

      // Not the target day
      if (now.getDay() !== day) return false

      const [weeklyHour, weeklyMin] = time.split(':').map(Number)
      const targetWeeklyMinutes = weeklyHour * 60 + weeklyMin
      const currentWeeklyMinutes = now.getHours() * 60 + now.getMinutes()

      // Haven't reached the target time yet today
      if (currentWeeklyMinutes < targetWeeklyMinutes) return false

      // Calculate this week's target time (current day at target time)
      const weekTarget = new Date(now)
      weekTarget.setHours(weeklyHour, weeklyMin, 0, 0)

      // If never sent, or last sent was before this week's target time, send
      if (!lastSent || lastSent < weekTarget) return true
      return false

    default:
      return false
  }
}

async function main() {
  console.log('Initializing video processing worker...')

  // Initialize storage
  await initStorage()

  // Calculate optimal concurrency based on available CPU cores
  // - 1-2 cores: 1 video at a time (low-end systems)
  // - 3-4 cores: 1 video at a time (mid-range systems, encoding is CPU intensive)
  // - 5-8 cores: 2 videos at a time (good balance)
  // - 9+ cores: 3 videos at a time (high-end systems)
  const cpuCores = os.cpus().length
  let concurrency = 2 // Default to 2
  if (cpuCores <= 4) {
    concurrency = 1
  } else if (cpuCores <= 8) {
    concurrency = 2
  } else {
    concurrency = 3
  }

  console.log(`Worker concurrency: ${concurrency} (based on ${cpuCores} CPU cores)`)

  const worker = new Worker<VideoProcessingJob>('video-processing', processVideo, {
    connection: getConnection(),
    concurrency,
    limiter: {
      max: concurrency * 10, // Max jobs per time window
      duration: 60000, // 1 minute window (prevents overload)
    },
  })

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err)
  })

  console.log('Video processing worker started')

  // Create notification processing queue with repeatable job
  console.log('Setting up notification processing...')
  const notificationQueue = new Queue('notification-processing', {
    connection: getConnection(),
  })

  // Add repeatable job to check notification schedules every 10 minutes
  // BullMQ handles persistence in Redis - survives restarts, distributed across workers
  await notificationQueue.add(
    'process-notifications',
    {}, // No data needed - we query the database
    {
      repeat: {
        pattern: '* * * * *', // Every 1 minute (cron format)
      },
      jobId: 'notification-processor', // Prevents duplicates
    }
  )

  // Create worker to process notification jobs
  const notificationWorker = new Worker(
    'notification-processing',
    async () => {
      console.log('Running scheduled notification check...')

      // Process both admin and client notifications
      await Promise.all([
        processAdminNotifications(),
        processClientNotifications(),
      ])

      console.log('Notification check completed')
    },
    {
      connection: getConnection(),
      concurrency: 1, // Only need one concurrent notification processor
    }
  )

  notificationWorker.on('completed', (job) => {
    console.log(`Notification check ${job.id} completed`)
  })

  notificationWorker.on('failed', (job, err) => {
    console.error(`Notification check ${job?.id} failed:`, err)
  })

  console.log('Notification worker started')
  console.log('  → Checks every 1 minute for scheduled summaries')
  console.log('  → IMMEDIATE notifications sent instantly (not in batches)')

  // Run cleanup on startup
  console.log('Running initial TUS upload cleanup...')
  await runCleanup().catch((err) => {
    console.error('Initial cleanup failed:', err)
  })

  // Cleanup old temp files on startup
  console.log('Running initial temp file cleanup...')
  await cleanupOldTempFiles()

  // Schedule periodic cleanup every 6 hours (TUS uploads)
  const tusCleanupInterval = setInterval(async () => {
    console.log('Running scheduled TUS upload cleanup...')
    await runCleanup().catch((err) => {
      console.error('Scheduled cleanup failed:', err)
    })
  }, 6 * 60 * 60 * 1000) // 6 hours in milliseconds

  // Schedule temp file cleanup every hour (more frequent for disk space)
  const tempCleanupInterval = setInterval(async () => {
    console.log('Running scheduled temp file cleanup...')
    await cleanupOldTempFiles()
  }, 60 * 60 * 1000) // 1 hour in milliseconds

  // Handle shutdown gracefully
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing workers...')
    clearInterval(tusCleanupInterval)
    clearInterval(tempCleanupInterval)
    await Promise.all([
      worker.close(),
      notificationWorker.close(),
      notificationQueue.close(),
    ])
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    console.log('SIGINT received, closing workers...')
    clearInterval(tusCleanupInterval)
    clearInterval(tempCleanupInterval)
    await Promise.all([
      worker.close(),
      notificationWorker.close(),
      notificationQueue.close(),
    ])
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Worker error:', err)
  process.exit(1)
})
