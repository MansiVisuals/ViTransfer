import { Worker, Queue } from 'bullmq'
import { VideoProcessingJob, AssetProcessingJob, ProjectUploadProcessingJob, ExternalNotificationJob } from '../lib/queue'
import { initStorage } from '../lib/storage'
import { runCleanup } from '../lib/upload-cleanup'
import { getRedisForQueue, closeRedisConnection } from '../lib/redis'
import { getCpuAllocation, logCpuAllocation } from '../lib/cpu-config'
import { processVideo } from './video-processor'
import { processAsset } from './asset-processor'
import { processProjectUpload } from './project-upload-processor'
import { processAdminNotifications } from './admin-notifications'
import { processClientNotifications } from './client-notifications'
import { processExternalNotificationJob } from './external-notifications/processExternalNotificationJob'
import { createCleanPreviewWorker } from './clean-preview-processor'
import { processDueDateReminders } from './due-date-reminders'
import { cleanupOldTempFiles, ensureTempDir } from './cleanup'
import { logError, logMessage } from '../lib/logging'

const DEBUG = process.env.DEBUG_WORKER === 'true'
const ONE_HOUR_MS = 60 * 60 * 1000
const SIX_HOURS_MS = 6 * 60 * 60 * 1000

async function main() {
  logMessage('[WORKER] Initializing video processing worker...')

  // Get centralized CPU allocation (coordinates with FFmpeg threads)
  const cpuAllocation = getCpuAllocation()
  logCpuAllocation(cpuAllocation)

  if (DEBUG) {
    logMessage('[WORKER DEBUG] Debug mode is ENABLED')
    logMessage(`[WORKER DEBUG] Node version: ${process.version}`)
    logMessage(`[WORKER DEBUG] Platform: ${process.platform}`)
    logMessage(`[WORKER DEBUG] Architecture: ${process.arch}`)
  }

  // Ensure temp directory exists
  ensureTempDir()

  // Initialize storage
  if (DEBUG) {
    logMessage('[WORKER DEBUG] Initializing storage...')
  }

  await initStorage()

  if (DEBUG) {
    logMessage('[WORKER DEBUG] Storage initialized')
  }

  // Use centralized CPU allocation for worker concurrency
  const concurrency = cpuAllocation.workerConcurrency

  logMessage(`[WORKER] Worker concurrency: ${concurrency} (from CPU allocation)`)

  const worker = new Worker<VideoProcessingJob>('video-processing', processVideo, {
    connection: getRedisForQueue(),
    concurrency,
    lockDuration: 600_000,
    stalledInterval: 300_000,
    maxStalledCount: 2,
    limiter: {
      max: concurrency * 10,
      duration: 60000,
    },
  })

  if (DEBUG) {
    logMessage(`[WORKER DEBUG] BullMQ worker created with config: ${JSON.stringify({
      queue: 'video-processing',
      concurrency,
      limiter: {
        max: concurrency * 10,
        duration: 60000
      }
    })}`)
  }

  worker.on('completed', (job) => {
    logMessage(`[WORKER] Job ${job.id} completed successfully`)
  })

  worker.on('failed', (job, err) => {
    logError(`[WORKER ERROR] Job ${job?.id} failed`, err)
    if (DEBUG) {
      logMessage(`[WORKER DEBUG] Job failure details: ${JSON.stringify({
        jobId: job?.id,
        jobData: job?.data,
        error: err instanceof Error ? err.stack : err
      })}`)
    }
  })

  logMessage('[WORKER] Video processing worker started')

  // Create asset processing worker
  const assetWorker = new Worker<AssetProcessingJob>('asset-processing', processAsset, {
    connection: getRedisForQueue(),
    concurrency: concurrency * 2, // Assets are lighter than videos
  })

  assetWorker.on('completed', (job) => {
    logMessage(`[WORKER] Asset job ${job.id} completed successfully`)
  })

  assetWorker.on('failed', (job, err) => {
    logError(`[WORKER ERROR] Asset job ${job?.id} failed`, err)
    if (DEBUG) {
      logMessage(`[WORKER DEBUG] Asset job failure details: ${JSON.stringify({
        jobId: job?.id,
        jobData: job?.data,
        error: err instanceof Error ? err.stack : err
      })}`)
    }
  })

  logMessage('[WORKER] Asset processing worker started')

  // Create project upload processing worker
  const projectUploadWorker = new Worker<ProjectUploadProcessingJob>('project-upload-processing', processProjectUpload, {
    connection: getRedisForQueue(),
    concurrency: concurrency * 2, // Project uploads are lighter than videos
  })

  projectUploadWorker.on('completed', (job) => {
    logMessage(`[WORKER] Project upload job ${job.id} completed successfully`)
  })

  projectUploadWorker.on('failed', (job, err) => {
    logError(`[WORKER ERROR] Project upload job ${job?.id} failed`, err)
    if (DEBUG) {
      logMessage(`[WORKER DEBUG] Project upload job failure details: ${JSON.stringify({
        jobId: job?.id,
        jobData: job?.data,
        error: err instanceof Error ? err.stack : err
      })}`)
    }
  })

  logMessage('[WORKER] Project upload processing worker started')

  // Create notification processing queue with repeatable job
  logMessage('Setting up notification processing...')
  const notificationQueue = new Queue('notification-processing', {
    connection: getRedisForQueue(),
  })

  // Add repeatable job to check notification schedules every minute
  await notificationQueue.add(
    'process-notifications',
    {},
    {
      repeat: {
        pattern: '* * * * *',
      },
      jobId: 'notification-processor',
      removeOnComplete: { count: 5 },
      removeOnFail: { count: 10 },
    }
  )

  // Create worker to process notification jobs
  const notificationWorker = new Worker(
    'notification-processing',
    async () => {
      logMessage('Running scheduled notification check...')

      await Promise.all([
        processAdminNotifications(),
        processClientNotifications(),
        processDueDateReminders(),
      ])

      logMessage('Notification check completed')
    },
    {
      connection: getRedisForQueue(),
      concurrency: 1,
    }
  )

  notificationWorker.on('completed', (job) => {
    logMessage(`Notification check ${job.id} completed`)
  })

  notificationWorker.on('failed', (job, err) => {
    logError(`Notification check ${job?.id} failed`, err)
  })

  logMessage('Notification worker started')
  logMessage('  → Checks every 1 minute for scheduled summaries')
  logMessage('  → IMMEDIATE notifications sent instantly (not in batches)')

  // Create worker to process external notification jobs (Apprise)
  const externalNotificationWorker = new Worker<ExternalNotificationJob>(
    'external-notifications',
    async (job) => {
      await processExternalNotificationJob(job.data, String(job.id ?? 'unknown'))
    },
    {
      connection: getRedisForQueue(),
      concurrency: 5,
    }
  )

  externalNotificationWorker.on('completed', (job) => {
    if (DEBUG) {
      logMessage(`[WORKER] External notification job ${job.id} completed`)
    }
  })

  externalNotificationWorker.on('failed', (job, err) => {
    logError(`[WORKER ERROR] External notification job ${job?.id} failed`, err)
  })

  logMessage('External notification worker started')

  // Create clean preview worker for generating non-watermarked previews on approval
  const cleanPreviewWorker = createCleanPreviewWorker()

  cleanPreviewWorker.on('completed', (job) => {
    logMessage(`[WORKER] Clean preview completed for video ${job.data.videoId}`)
  })

  cleanPreviewWorker.on('failed', (job, err) => {
    logError(`[WORKER ERROR] Clean preview failed for video ${job?.data.videoId}`, err)
  })

  logMessage('[WORKER] Clean preview worker started')

  // Run cleanup on startup
  logMessage('Running initial TUS upload cleanup...')
  await runCleanup().catch((err) => {
    logError('Initial cleanup failed', err)
  })

  // Cleanup old temp files on startup
  logMessage('Running initial temp file cleanup...')
  await cleanupOldTempFiles()

  // Schedule periodic cleanup every 6 hours (TUS uploads)
  const tusCleanupInterval = setInterval(async () => {
    logMessage('Running scheduled TUS upload cleanup...')
    await runCleanup().catch((err) => {
      logError('Scheduled cleanup failed', err)
    })
  }, SIX_HOURS_MS)

  // Schedule temp file cleanup every hour
  const tempCleanupInterval = setInterval(async () => {
    logMessage('Running scheduled temp file cleanup...')
    await cleanupOldTempFiles()
  }, ONE_HOUR_MS)

  // Handle shutdown gracefully
  process.on('SIGTERM', async () => {
    logMessage('SIGTERM received, closing workers...')
    clearInterval(tusCleanupInterval)
    clearInterval(tempCleanupInterval)
    await Promise.all([
      worker.close(),
      assetWorker.close(),
      notificationWorker.close(),
      externalNotificationWorker.close(),
      cleanPreviewWorker.close(),
      notificationQueue.close(),
    ])
    await closeRedisConnection()
    logMessage('Redis connection closed')
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    logMessage('SIGINT received, closing workers...')
    clearInterval(tusCleanupInterval)
    clearInterval(tempCleanupInterval)
    await Promise.all([
      worker.close(),
      assetWorker.close(),
      notificationWorker.close(),
      externalNotificationWorker.close(),
      cleanPreviewWorker.close(),
      notificationQueue.close(),
    ])
    await closeRedisConnection()
    logMessage('Redis connection closed')
    process.exit(0)
  })
}

main().catch((err) => {
  logError('Worker error', err)
  process.exit(1)
})
