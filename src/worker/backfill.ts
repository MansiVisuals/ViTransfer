import { prisma } from '../lib/db'
import { getRedis } from '../lib/redis'
import { getProjectUploadQueue, getPhotoQueue } from '../lib/queue'
import { logError, logMessage } from '../lib/logging'

// One-time flag per backfill generation — reprocessing is idempotent, the flag
// just avoids re-enqueuing on every worker restart
const BACKFILL_FLAG_KEY = 'backfill:v1.2.1:preview-thumbnails'

/**
 * 1.2.1 backfill: client uploads gained worker-generated preview thumbnails
 * (image/video/audio). Re-enqueue processing for completed uploads that
 * predate the change, and for photos whose thumbnail generation failed.
 */
export async function runPreviewThumbnailBackfill() {
  const redis = getRedis()
  const acquired = await redis.set(BACKFILL_FLAG_KEY, new Date().toISOString(), 'NX')
  if (!acquired) {
    return
  }

  try {
    const uploads = await prisma.projectUpload.findMany({
      where: {
        uploadCompletedAt: { not: null },
        thumbnailPath: null,
        OR: [
          { fileType: { startsWith: 'image/' } },
          { fileType: { startsWith: 'video/' } },
          { fileType: { startsWith: 'audio/' } },
        ],
      },
      select: { id: true, storagePath: true, projectId: true },
    })

    const uploadQueue = getProjectUploadQueue()
    for (const upload of uploads) {
      await uploadQueue.add('process-upload', {
        uploadId: upload.id,
        storagePath: upload.storagePath,
        projectId: upload.projectId,
      })
    }

    const photos = await prisma.photo.findMany({
      where: {
        uploadCompletedAt: { not: null },
        thumbnailPath: null,
        NOT: { fileType: { startsWith: 'INVALID' } },
      },
      select: { id: true, storagePath: true },
    })

    const photoQueue = getPhotoQueue()
    for (const photo of photos) {
      await photoQueue.add('process-photo', {
        photoId: photo.id,
        storagePath: photo.storagePath,
      })
    }

    if (uploads.length > 0 || photos.length > 0) {
      logMessage(`[BACKFILL] Queued preview thumbnail generation for ${uploads.length} client upload(s) and ${photos.length} photo(s)`)
    } else {
      logMessage('[BACKFILL] Preview thumbnails: nothing to backfill')
    }
  } catch (error) {
    // Clear the flag so the next worker start retries the backfill
    await redis.del(BACKFILL_FLAG_KEY).catch(() => {})
    logError('[BACKFILL] Preview thumbnail backfill failed', error)
  }
}
