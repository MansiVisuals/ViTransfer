import { Job } from 'bullmq'
import sharp from 'sharp'
import { prisma } from '../lib/db'
import { downloadFile, uploadFile } from '../lib/storage'
import { ALLOWED_PHOTO_TYPES } from '../lib/file-validation'
import { PhotoProcessingJob } from '../lib/queue'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { TEMP_DIR } from './cleanup'
import { logError, logMessage } from '../lib/logging'

const THUMBNAIL_SIZE = 512 // longest edge in pixels
const THUMBNAIL_QUALITY = 75

/**
 * Process uploaded photo - validate magic bytes, extract dimensions,
 * generate webp thumbnail. Called after upload completes.
 */
export async function processPhoto(job: Job<PhotoProcessingJob>) {
  const { photoId, storagePath } = job.data

  logMessage(`[WORKER] Processing photo ${photoId}`)

  let tempFilePath: string | undefined

  try {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: { album: { select: { id: true, projectId: true } } },
    })

    if (!photo) {
      throw new Error(`Photo record not found: ${photoId}`)
    }

    tempFilePath = path.join(TEMP_DIR, `${photoId}-photo`)
    const downloadStream = await downloadFile(storagePath)
    await pipeline(downloadStream, fs.createWriteStream(tempFilePath))

    const stats = fs.statSync(tempFilePath)
    if (stats.size === 0) {
      throw new Error('Downloaded file is empty')
    }

    // Validate magic bytes - photos must be a real image of an allowed type
    const { fileTypeFromFile } = await import('file-type')
    const fileType = await fileTypeFromFile(tempFilePath)

    if (!fileType || !ALLOWED_PHOTO_TYPES.mimeTypes.includes(fileType.mime)) {
      await prisma.photo.update({
        where: { id: photoId },
        data: { fileType: 'INVALID - ' + (fileType?.mime || 'unknown') },
      })
      throw new Error(`File content is not an allowed photo type. Detected: ${fileType?.mime || 'unknown'}`)
    }

    // Extract dimensions and generate thumbnail (animated GIFs keep first frame)
    const image = sharp(tempFilePath)
    const metadata = await image.metadata()

    const thumbnailBuffer = await image
      .rotate() // apply EXIF orientation
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMBNAIL_QUALITY })
      .toBuffer()

    const thumbnailPath = `projects/${photo.album.projectId}/photos/${photo.album.id}/thumbs/${photoId}.webp`
    await uploadFile(thumbnailPath, thumbnailBuffer, thumbnailBuffer.length, 'image/webp')

    // EXIF orientation 5-8 swaps width/height for display
    const orientationSwaps = (metadata.orientation || 1) >= 5
    await prisma.photo.update({
      where: { id: photoId },
      data: {
        fileType: fileType.mime,
        thumbnailPath,
        width: (orientationSwaps ? metadata.height : metadata.width) ?? null,
        height: (orientationSwaps ? metadata.width : metadata.height) ?? null,
      },
    })

    logMessage(`[WORKER] Photo ${photoId} processed successfully (${fileType.mime}, ${metadata.width}x${metadata.height})`)
  } catch (error) {
    logError(`[WORKER ERROR] Photo processing failed for ${photoId}`, error)
    throw error
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath)
      } catch (cleanupError) {
        logError('[WORKER ERROR] Failed to cleanup temp file', cleanupError)
      }
    }
  }
}
