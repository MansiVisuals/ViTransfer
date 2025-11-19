import { Worker, Queue } from 'bullmq'
import { getConnection, VideoProcessingJob } from '../lib/queue'
import { initStorage } from '../lib/storage'
import { runCleanup } from '../lib/upload-cleanup'
import { closeRedisConnection } from '../lib/redis'
import os from 'os'
import { processVideo } from './video-processor'
import { processAdminNotifications } from './admin-notifications'
import { processClientNotifications } from './client-notifications'
import { cleanupOldTempFiles, ensureTempDir } from './cleanup'

const DEBUG = process.env.DEBUG_WORKER === 'true'
const ONE_HOUR_MS = 60 * 60 * 1000
const SIX_HOURS_MS = 6 * 60 * 60 * 1000

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

  // Calculate optimal concurrency based on available CPU cores
  const cpuCores = os.cpus().length
  let concurrency = 2
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

  // Create notification processing queue with repeatable job
  console.log('Setting up notification processing...')
  const notificationQueue = new Queue('notification-processing', {
    connection: getConnection(),
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
      connection: getConnection(),
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
      notificationWorker.close(),
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
      notificationWorker.close(),
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
