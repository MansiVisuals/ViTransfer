import { Worker, Queue } from 'bullmq'
import { VideoProcessingJob, AssetProcessingJob, ExternalNotificationJob } from '../lib/queue'
import { initStorage } from '../lib/storage'
import { runCleanup } from '../lib/upload-cleanup'
import { getRedisForQueue, closeRedisConnection } from '../lib/redis'
import { getCpuAllocation, logCpuAllocation } from '../lib/cpu-config'
import { processVideo } from './video-processor'
import { processAsset } from './asset-processor'
import { processAdminNotifications } from './admin-notifications'
import { processClientNotifications } from './client-notifications'
import { processExternalNotificationJob } from './external-notifications/processExternalNotificationJob'
import { createCleanPreviewWorker } from './clean-preview-processor'
import { cleanupOldTempFiles, ensureTempDir } from './cleanup'

const DEBUG = process.env.DEBUG_WORKER === 'true'
const ONE_HOUR_MS = 60 * 60 * 1000
const SIX_HOURS_MS = 6 * 60 * 60 * 1000

async function main() {
  console.log('[WORKER] Initializing video processing worker...')

  // Get centralized CPU allocation (coordinates with FFmpeg threads)
  const cpuAllocation = getCpuAllocation()
  logCpuAllocation(cpuAllocation)

  if (DEBUG) {
    console.log('[WORKER DEBUG] Debug mode is ENABLED')
    console.log('[WORKER DEBUG] Node version:', process.version)
    console.log('[WORKER DEBUG] Platform:', process.platform)
    console.log('[WORKER DEBUG] Architecture:', process.arch)
  }

  // Ensure temp directory exists
  ensureTempDir()

  // Initialize storage
  if (DEBUG) {
    console.log('[WORKER DEBUG] Initializing storage...')
  }

  await initStorage()

  if (DEBUG) {
    console.log('[WORKER DEBUG] Storage initialized')
  }

  // Use centralized CPU allocation for worker concurrency
  const concurrency = cpuAllocation.workerConcurrency

  console.log(`[WORKER] Worker concurrency: ${concurrency} (from CPU allocation)`)

  const worker = new Worker<VideoProcessingJob>('video-processing', processVideo, {
    connection: getRedisForQueue(),
    concurrency,
    limiter: {
      max: concurrency * 10,
      duration: 60000,
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

  // Create asset processing worker
  const assetWorker = new Worker<AssetProcessingJob>('asset-processing', processAsset, {
    connection: getRedisForQueue(),
    concurrency: concurrency * 2, // Assets are lighter than videos
  })

  assetWorker.on('completed', (job) => {
    console.log(`[WORKER] Asset job ${job.id} completed successfully`)
  })

  assetWorker.on('failed', (job, err) => {
    console.error(`[WORKER ERROR] Asset job ${job?.id} failed:`, err)
    if (DEBUG) {
      console.error('[WORKER DEBUG] Asset job failure details:', {
        jobId: job?.id,
        jobData: job?.data,
        error: err instanceof Error ? err.stack : err
      })
    }
  })

  console.log('[WORKER] Asset processing worker started')

  // Create notification processing queue with repeatable job
  console.log('Setting up notification processing...')
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
    }
  )

  // Create worker to process notification jobs
  const notificationWorker = new Worker(
    'notification-processing',
    async () => {
      console.log('Running scheduled notification check...')

      await Promise.all([
        processAdminNotifications(),
        processClientNotifications(),
      ])

      console.log('Notification check completed')
    },
    {
      connection: getRedisForQueue(),
      concurrency: 1,
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
      console.log(`[WORKER] External notification job ${job.id} completed`)
    }
  })

  externalNotificationWorker.on('failed', (job, err) => {
    console.error(`[WORKER ERROR] External notification job ${job?.id} failed:`, err)
  })

  console.log('External notification worker started')

  // Create clean preview worker for generating non-watermarked previews on approval
  const cleanPreviewWorker = createCleanPreviewWorker()

  cleanPreviewWorker.on('completed', (job) => {
    console.log(`[WORKER] Clean preview completed for video ${job.data.videoId}`)
  })

  cleanPreviewWorker.on('failed', (job, err) => {
    console.error(`[WORKER ERROR] Clean preview failed for video ${job?.data.videoId}:`, err.message)
  })

  console.log('[WORKER] Clean preview worker started')

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
  }, SIX_HOURS_MS)

  // Schedule temp file cleanup every hour
  const tempCleanupInterval = setInterval(async () => {
    console.log('Running scheduled temp file cleanup...')
    await cleanupOldTempFiles()
  }, ONE_HOUR_MS)

  // Handle shutdown gracefully
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing workers...')
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
    console.log('Redis connection closed')
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    console.log('SIGINT received, closing workers...')
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
    console.log('Redis connection closed')
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Worker error:', err)
  process.exit(1)
})
