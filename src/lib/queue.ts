import { Queue, Worker, Job } from 'bullmq'
import { getRedisForQueue } from './redis'

// Lazy initialization to prevent connections during build time
let videoQueueInstance: Queue<VideoProcessingJob> | null = null
let assetQueueInstance: Queue<AssetProcessingJob> | null = null

export interface VideoProcessingJob {
  videoId: string
  originalStoragePath: string
  projectId: string
}

export interface AssetProcessingJob {
  assetId: string
  storagePath: string
  expectedCategory?: string
}

export function getVideoQueue(): Queue<VideoProcessingJob> {
  // Don't create queue during build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    throw new Error('Queue not available during build phase')
  }
  
  if (!videoQueueInstance) {
    videoQueueInstance = new Queue<VideoProcessingJob>('video-processing', {
      connection: getRedisForQueue(),
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

export function getAssetQueue(): Queue<AssetProcessingJob> {
  // Don't create queue during build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    throw new Error('Queue not available during build phase')
  }

  if (!assetQueueInstance) {
    assetQueueInstance = new Queue<AssetProcessingJob>('asset-processing', {
      connection: getRedisForQueue(),
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
  return assetQueueInstance
}

// Export for backward compatibility, but use getter in new code
export const videoQueue = new Proxy({} as Queue<VideoProcessingJob>, {
  get(target, prop) {
    return getVideoQueue()[prop as keyof Queue<VideoProcessingJob>]
  }
})

export const assetQueue = new Proxy({} as Queue<AssetProcessingJob>, {
  get(target, prop) {
    return getAssetQueue()[prop as keyof Queue<AssetProcessingJob>]
  }
})
