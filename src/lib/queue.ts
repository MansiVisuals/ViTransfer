import { Queue } from 'bullmq'
import { getRedisForQueue } from './redis'

// Lazy initialization to prevent connections during build time
let videoQueueInstance: Queue<VideoProcessingJob> | null = null
let assetQueueInstance: Queue<AssetProcessingJob> | null = null
let externalNotificationQueueInstance: Queue<ExternalNotificationJob> | null = null
let cleanPreviewQueueInstance: Queue<CleanPreviewJob> | null = null

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

export interface ExternalNotificationJob {
  // When set, worker sends only to these destinations (used for tests).
  destinationIds?: string[]

  // Used for subscription matching and logging.
  eventType: string

  title: string
  body: string
  notifyType?: 'info' | 'success' | 'warning' | 'failure'
}

export interface CleanPreviewJob {
  videoId: string
  projectId: string
  originalStoragePath: string
  resolution: string // "720p" or "1080p"
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

export function getExternalNotificationQueue(): Queue<ExternalNotificationJob> {
  // Don't create queue during build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    throw new Error('Queue not available during build phase')
  }

  if (!externalNotificationQueueInstance) {
    externalNotificationQueueInstance = new Queue<ExternalNotificationJob>('external-notifications', {
      connection: getRedisForQueue(),
      defaultJobOptions: {
        attempts: 5,
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

  return externalNotificationQueueInstance
}

export function getCleanPreviewQueue(): Queue<CleanPreviewJob> {
  // Don't create queue during build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    throw new Error('Queue not available during build phase')
  }

  if (!cleanPreviewQueueInstance) {
    cleanPreviewQueueInstance = new Queue<CleanPreviewJob>('clean-preview-processing', {
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

  return cleanPreviewQueueInstance
}

// Export for backward compatibility, but use getter in new code
export const videoQueue = new Proxy({} as Queue<VideoProcessingJob>, {
  get(_target, prop) {
    return getVideoQueue()[prop as keyof Queue<VideoProcessingJob>]
  }
})

export const assetQueue = new Proxy({} as Queue<AssetProcessingJob>, {
  get(_target, prop) {
    return getAssetQueue()[prop as keyof Queue<AssetProcessingJob>]
  }
})
