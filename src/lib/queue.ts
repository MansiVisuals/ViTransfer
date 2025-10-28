import { Queue, Worker, Job } from 'bullmq'
import IORedis from 'ioredis'

// Lazy initialization to prevent connections during build time
let connection: IORedis | null = null
let videoQueueInstance: Queue<VideoProcessingJob> | null = null

function getConnection(): IORedis {
  if (!connection) {
    connection = new IORedis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      lazyConnect: true, // Don't connect immediately
      enableReadyCheck: false,
      retryStrategy: (times) => {
        // Only retry in production/runtime, not during build
        if (process.env.NEXT_PHASE === 'phase-production-build') {
          return null // Don't retry during build
        }
        const delay = Math.min(times * 50, 2000)
        return delay
      },
    })
  }
  return connection
}

export interface VideoProcessingJob {
  videoId: string
  originalStoragePath: string
  projectId: string
}

export function getVideoQueue(): Queue<VideoProcessingJob> {
  // Don't create queue during build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    throw new Error('Queue not available during build phase')
  }
  
  if (!videoQueueInstance) {
    videoQueueInstance = new Queue<VideoProcessingJob>('video-processing', {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600, // keep completed jobs for 1 hour
        },
        removeOnFail: {
          age: 86400, // keep failed jobs for 24 hours
        },
      },
    })
  }
  return videoQueueInstance
}

// Export for backward compatibility, but use getter in new code
export const videoQueue = new Proxy({} as Queue<VideoProcessingJob>, {
  get(target, prop) {
    return getVideoQueue()[prop as keyof Queue<VideoProcessingJob>]
  }
})

export { connection, getConnection }
