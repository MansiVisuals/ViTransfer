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

// Debug mode - outputs verbose worker logs
// Enable with: DEBUG_WORKER=true environment variable
const DEBUG = process.env.DEBUG_WORKER === 'true'

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

  console.log(`[WORKER] Processing video ${videoId}`)

  if (DEBUG) {
    console.log('[WORKER DEBUG] Job data:', JSON.stringify(job.data, null, 2))
    console.log('[WORKER DEBUG] Job ID:', job.id)
    console.log('[WORKER DEBUG] Job timestamp:', new Date(job.timestamp).toISOString())
  }

  // Declare temp paths outside try block for cleanup in catch
  let tempInputPath: string | undefined
  let tempPreviewPath: string | undefined
  let tempThumbnailPath: string | undefined

  try {
    // Update status to processing
    if (DEBUG) {
      console.log('[WORKER DEBUG] Updating video status to PROCESSING...')
    }

    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'PROCESSING', processingProgress: 0 },
    })

    if (DEBUG) {
      console.log('[WORKER DEBUG] Database updated to PROCESSING status')
    }

    // Download original file to temp location
    tempInputPath = path.join(TEMP_DIR, `${videoId}-original`)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Downloading original file from:', originalStoragePath)
      console.log('[WORKER DEBUG] Temp input path:', tempInputPath)
    }

    const downloadStart = Date.now()
    const downloadStream = await downloadFile(originalStoragePath)
    await pipeline(downloadStream, fs.createWriteStream(tempInputPath))
    const downloadTime = Date.now() - downloadStart

    console.log(`[WORKER] Downloaded original file for video ${videoId} in ${(downloadTime / 1000).toFixed(2)}s`)

    // Verify file exists and has content
    const stats = fs.statSync(tempInputPath)
    if (stats.size === 0) {
      throw new Error('Downloaded file is empty')
    }

    console.log(`[WORKER] Downloaded file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)

    if (DEBUG) {
      console.log('[WORKER DEBUG] File verification passed')
      console.log('[WORKER DEBUG] Download speed:', (stats.size / 1024 / 1024 / (downloadTime / 1000)).toFixed(2), 'MB/s')
    }

    // Get video metadata
    if (DEBUG) {
      console.log('[WORKER DEBUG] Getting video metadata...')
    }

    const metadataStart = Date.now()
    const metadata = await getVideoMetadata(tempInputPath)
    const metadataTime = Date.now() - metadataStart

    console.log(`[WORKER] Video metadata:`, metadata)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Metadata extraction took:', (metadataTime / 1000).toFixed(2), 's')
    }

    // Get project and video details for watermark and settings
    if (DEBUG) {
      console.log('[WORKER DEBUG] Fetching project and video details...')
    }

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

    if (DEBUG) {
      console.log('[WORKER DEBUG] Project settings:', {
        title: project?.title,
        previewResolution: project?.previewResolution,
        watermarkEnabled: project?.watermarkEnabled,
        watermarkText: project?.watermarkText
      })
      console.log('[WORKER DEBUG] Video version label:', video?.versionLabel)
    }

    // Use custom watermark text or default format (only if watermarks are enabled)
    const watermarkText = project?.watermarkEnabled
      ? (project.watermarkText || `PREVIEW-${project.title || 'PROJECT'}-${video?.versionLabel || 'v1'}`)
      : undefined

    if (DEBUG) {
      console.log('[WORKER DEBUG] Final watermark text:', watermarkText || '(no watermark)')
    }

    // Detect if video is vertical (portrait) or horizontal (landscape)
    const isVertical = metadata.height > metadata.width
    const aspectRatio = metadata.width / metadata.height

    console.log(`[WORKER] Video orientation: ${isVertical ? 'vertical' : 'horizontal'} (${metadata.width}x${metadata.height}, ratio: ${aspectRatio.toFixed(2)})`)

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

    console.log(`[WORKER] Output resolution: ${outputWidth}x${outputHeight}`)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Resolution details:', {
        setting: resolution,
        isVertical,
        inputDimensions: `${metadata.width}x${metadata.height}`,
        outputDimensions: `${outputWidth}x${outputHeight}`,
        aspectRatio
      })
    }

    // Generate preview with watermark
    tempPreviewPath = path.join(TEMP_DIR, `${videoId}-preview.mp4`)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Starting video transcoding...')
      console.log('[WORKER DEBUG] Temp preview path:', tempPreviewPath)
    }

    const transcodeStart = Date.now()
    await transcodeVideo({
      inputPath: tempInputPath,
      outputPath: tempPreviewPath,
      width: outputWidth,
      height: outputHeight,
      watermarkText,
      onProgress: async (progress) => {
        if (DEBUG) {
          console.log(`[WORKER DEBUG] Transcode progress: ${(progress * 100).toFixed(1)}%`)
        }
        await prisma.video.update({
          where: { id: videoId },
          data: { processingProgress: progress * 0.8 },
        })
      },
    })
    const transcodeTime = Date.now() - transcodeStart

    console.log(`[WORKER] Generated ${resolution} preview for video ${videoId} in ${(transcodeTime / 1000).toFixed(2)}s`)

    if (DEBUG) {
      const transcodeStats = fs.statSync(tempPreviewPath)
      console.log('[WORKER DEBUG] Transcoded file size:', (transcodeStats.size / 1024 / 1024).toFixed(2), 'MB')
      console.log('[WORKER DEBUG] Size reduction:', ((1 - transcodeStats.size / stats.size) * 100).toFixed(1), '%')
    }

    // Upload preview
    const previewPath = `projects/${projectId}/videos/${videoId}/preview-${resolution}.mp4`
    const statsPreview = fs.statSync(tempPreviewPath)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Uploading preview to:', previewPath)
      console.log('[WORKER DEBUG] Preview file size:', (statsPreview.size / 1024 / 1024).toFixed(2), 'MB')
    }

    const uploadStart = Date.now()
    await uploadFile(
      previewPath,
      fs.createReadStream(tempPreviewPath),
      statsPreview.size,
      'video/mp4'
    )
    const uploadTime = Date.now() - uploadStart

    if (DEBUG) {
      console.log('[WORKER DEBUG] Preview uploaded in:', (uploadTime / 1000).toFixed(2), 's')
      console.log('[WORKER DEBUG] Upload speed:', (statsPreview.size / 1024 / 1024 / (uploadTime / 1000)).toFixed(2), 'MB/s')
    }

    // Generate thumbnail
    // Use safe timestamp: 10% into the video or 1 second, whichever is smaller
    // This prevents seeking beyond video duration for short videos
    const thumbnailTimestamp = Math.min(Math.max(metadata.duration * 0.1, 0.5), 10)
    tempThumbnailPath = path.join(TEMP_DIR, `${videoId}-thumb.jpg`)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Generating thumbnail...')
      console.log('[WORKER DEBUG] Temp thumbnail path:', tempThumbnailPath)
      console.log('[WORKER DEBUG] Thumbnail timestamp:', thumbnailTimestamp, 's')
    }

    const thumbStart = Date.now()
    await generateThumbnail(tempInputPath, tempThumbnailPath, thumbnailTimestamp)
    const thumbTime = Date.now() - thumbStart

    console.log(`[WORKER] Generated thumbnail for video ${videoId} in ${(thumbTime / 1000).toFixed(2)}s`)

    // Upload thumbnail
    const thumbnailPath = `projects/${projectId}/videos/${videoId}/thumbnail.jpg`
    const statsThumbnail = fs.statSync(tempThumbnailPath)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Uploading thumbnail to:', thumbnailPath)
      console.log('[WORKER DEBUG] Thumbnail file size:', (statsThumbnail.size / 1024).toFixed(2), 'KB')
    }

    const thumbUploadStart = Date.now()
    await uploadFile(
      thumbnailPath,
      fs.createReadStream(tempThumbnailPath),
      statsThumbnail.size,
      'image/jpeg'
    )
    const thumbUploadTime = Date.now() - thumbUploadStart

    if (DEBUG) {
      console.log('[WORKER DEBUG] Thumbnail uploaded in:', (thumbUploadTime / 1000).toFixed(2), 's')
    }

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

    if (DEBUG) {
      console.log('[WORKER DEBUG] Updating database with final video data...')
      console.log('[WORKER DEBUG] Update data:', JSON.stringify(updateData, null, 2))
    }

    await prisma.video.update({
      where: { id: videoId },
      data: updateData,
    })

    if (DEBUG) {
      console.log('[WORKER DEBUG] Database updated to READY status')
    }

    // Cleanup temp files with proper async error handling
    if (DEBUG) {
      console.log('[WORKER DEBUG] Starting temp file cleanup...')
    }

    const cleanupFiles = [tempInputPath, tempPreviewPath, tempThumbnailPath]
    for (const file of cleanupFiles) {
      try {
        if (fs.existsSync(file)) {
          const fileStats = fs.statSync(file)
          await fs.promises.unlink(file)
          console.log(`[WORKER] Cleaned up temp file: ${path.basename(file)}`)
          if (DEBUG) {
            console.log('[WORKER DEBUG] Freed disk space:', (fileStats.size / 1024 / 1024).toFixed(2), 'MB')
          }
        }
      } catch (cleanupError) {
        console.error(`[WORKER ERROR] Failed to cleanup temp file ${path.basename(file)}:`, cleanupError)
        // Continue cleanup - don't let one failure stop the others
      }
    }

    const totalTime = Date.now() - downloadStart
    console.log(`[WORKER] Successfully processed video ${videoId} in ${(totalTime / 1000).toFixed(2)}s`)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Processing breakdown:')
      console.log('[WORKER DEBUG]   - Download:', (downloadTime / 1000).toFixed(2), 's')
      console.log('[WORKER DEBUG]   - Metadata:', (metadataTime / 1000).toFixed(2), 's')
      console.log('[WORKER DEBUG]   - Transcode:', (transcodeTime / 1000).toFixed(2), 's')
      console.log('[WORKER DEBUG]   - Thumbnail:', (thumbTime / 1000).toFixed(2), 's')
      console.log('[WORKER DEBUG]   - Upload:', ((uploadTime + thumbUploadTime) / 1000).toFixed(2), 's')
    }
  } catch (error) {
    console.error(`[WORKER ERROR] Error processing video ${videoId}:`, error)

    if (DEBUG) {
      console.error('[WORKER DEBUG] Full error stack:', error instanceof Error ? error.stack : error)
    }

    // Cleanup temp files even on error
    if (DEBUG) {
      console.log('[WORKER DEBUG] Cleaning up temp files after error...')
    }

    const cleanupFiles = [tempInputPath, tempPreviewPath, tempThumbnailPath].filter((f): f is string => !!f)
    for (const file of cleanupFiles) {
      try {
        if (fs.existsSync(file)) {
          await fs.promises.unlink(file)
          if (DEBUG) {
            console.log('[WORKER DEBUG] Cleaned up:', path.basename(file))
          }
        }
      } catch (cleanupError) {
        console.error(`[WORKER ERROR] Failed to cleanup temp file after error:`, cleanupError)
      }
    }

    // Update video with error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (DEBUG) {
      console.log('[WORKER DEBUG] Updating database with error status...')
      console.log('[WORKER DEBUG] Error message:', errorMessage)
    }

    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'ERROR',
        processingError: errorMessage,
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
          const notifications = project.notificationQueue.map(n => n.data as any)

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

/**
 * Handle notification send with automatic retry logic
 * DRY helper - used by both admin and client notification processing
 */
async function sendNotificationsWithRetry(config: {
  notificationIds: string[]
  currentAttempts: number
  isClientNotification: boolean
  onSuccess: () => Promise<void>
  logPrefix: string
}): Promise<{ success: boolean; lastError?: string }> {
  const { notificationIds, currentAttempts, isClientNotification, onSuccess, logPrefix } = config
  const MAX_ATTEMPTS = 3

  let sendSuccess = false
  let lastError: string | undefined

  try {
    await onSuccess()
    sendSuccess = true
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Unknown error'
    console.error(`${logPrefix} Send failed:`, error)
  }

  const fieldPrefix = isClientNotification ? 'client' : 'admin'
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
 * Check if notifications should be sent now (CRON-like scheduling)
 *
 * CRON Principle: Compares last sent time against the most recent target time.
 * If schedule changes (e.g., WEEKLY→DAILY), immediately re-evaluates and sends if past due.
 *
 * TZ Note: All Date operations use container's TZ (set via TZ env var in docker-compose)
 */
function shouldSendNow(
  schedule: string,
  time: string | null,
  day: number | null,
  lastSent: Date | null,
  now: Date
): boolean {
  // Helper: Calculate target datetime
  const getTargetTime = (): Date | null => {
    switch (schedule) {
      case 'HOURLY':
        // Target: Start of current hour
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
        // Only send on the target day
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

async function main() {
  console.log('[WORKER] Initializing video processing worker...')

  if (DEBUG) {
    console.log('[WORKER DEBUG] Debug mode is ENABLED')
    console.log('[WORKER DEBUG] Node version:', process.version)
    console.log('[WORKER DEBUG] Platform:', process.platform)
    console.log('[WORKER DEBUG] Architecture:', process.arch)
    console.log('[WORKER DEBUG] Memory:', {
      total: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + ' GB',
      free: (os.freemem() / 1024 / 1024 / 1024).toFixed(2) + ' GB'
    })
  }

  // Initialize storage
  if (DEBUG) {
    console.log('[WORKER DEBUG] Initializing storage...')
  }

  await initStorage()

  if (DEBUG) {
    console.log('[WORKER DEBUG] Storage initialized')
  }

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

  console.log(`[WORKER] Worker concurrency: ${concurrency} (based on ${cpuCores} CPU cores)`)

  if (DEBUG) {
    console.log('[WORKER DEBUG] CPU details:', {
      cores: cpuCores,
      model: os.cpus()[0]?.model || 'Unknown',
      concurrency
    })
  }

  const worker = new Worker<VideoProcessingJob>('video-processing', processVideo, {
    connection: getConnection(),
    concurrency,
    limiter: {
      max: concurrency * 10, // Max jobs per time window
      duration: 60000, // 1 minute window (prevents overload)
    },
  })

  if (DEBUG) {
    console.log('[WORKER DEBUG] BullMQ worker created with config:', {
      queue: 'video-processing',
      concurrency,
      limiter: {
        max: concurrency * 10,
        duration: 60000
      }
    })
  }

  worker.on('completed', (job) => {
    console.log(`[WORKER] Job ${job.id} completed successfully`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[WORKER ERROR] Job ${job?.id} failed:`, err)
    if (DEBUG) {
      console.error('[WORKER DEBUG] Job failure details:', {
        jobId: job?.id,
        jobData: job?.data,
        error: err instanceof Error ? err.stack : err
      })
    }
  })

  console.log('[WORKER] Video processing worker started')

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
