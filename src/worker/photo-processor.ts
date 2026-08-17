import { Job } from 'bullmq'
import sharp from 'sharp'
import { prisma } from '../lib/db'
import { downloadFile, uploadFile } from '../lib/storage'
import { ALLOWED_PHOTO_TYPES, rawPhotoMimeForFile } from '../lib/file-validation'
import { decodeRawPhoto } from './raw-preview'
import { PhotoProcessingJob } from '../lib/queue'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { TEMP_DIR } from './cleanup'
import { logError, logMessage } from '../lib/logging'

const THUMBNAIL_SIZE = 512 // longest edge in pixels
const THUMBNAIL_QUALITY = 75
const PREVIEW_SIZE = 2048 // longest edge — lightbox rendition, originals are download-only
const PREVIEW_QUALITY = 82

/**
 * Process uploaded photo - validate magic bytes, extract dimensions,
 * generate webp thumbnail. Called after upload completes.
 */
export async function processPhoto(job: Job<PhotoProcessingJob>) {
  const { photoId, storagePath } = job.data

  logMessage(`[WORKER] Processing photo ${photoId}`)

  let tempDir: string | undefined

  try {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: { album: { select: { id: true, projectId: true } } },
    })

    if (!photo) {
      throw new Error(`Photo record not found: ${photoId}`)
    }

    // A directory per photo: LibRaw writes its output next to the input, and
    // the decoded file is found by looking for what appeared beside the raw.
    tempDir = path.join(TEMP_DIR, `photo-${photoId}`)
    fs.mkdirSync(tempDir, { recursive: true })

    const tempFilePath = path.join(tempDir, 'original')
    const downloadStream = await downloadFile(storagePath)
    await pipeline(downloadStream, fs.createWriteStream(tempFilePath))

    const stats = fs.statSync(tempFilePath)
    if (stats.size === 0) {
      throw new Error('Downloaded file is empty')
    }

    // Validate magic bytes - photos must be a real image of an allowed type
    const { fileTypeFromFile } = await import('file-type')
    const fileType = await fileTypeFromFile(tempFilePath)
    const detectedMime = fileType?.mime

    // Most raws identify themselves precisely, but DNG and ARW are TIFF
    // containers that read back as plain TIFF whenever the marker tags sit
    // beyond the header, so the extension settles those.
    const claimedRawMime = rawPhotoMimeForFile(photo.fileName)
    const isRaw = !!claimedRawMime && (detectedMime === claimedRawMime || detectedMime === 'image/tiff')

    if (!detectedMime || (!isRaw && !ALLOWED_PHOTO_TYPES.mimeTypes.includes(detectedMime))) {
      await prisma.photo.update({
        where: { id: photoId },
        data: { fileType: 'INVALID - ' + (detectedMime || 'unknown') },
      })
      throw new Error(`File content is not an allowed photo type. Detected: ${detectedMime || 'unknown'}`)
    }

    // Raws carry no browser-renderable image, so renditions come off a decoded
    // copy while the stored original stays exactly as the camera wrote it.
    const photoMime = isRaw ? claimedRawMime! : detectedMime
    const sourcePath = isRaw
      ? await decodeRawPhoto(tempFilePath, PREVIEW_SIZE)
      : tempFilePath

    // Extract dimensions and generate renditions (animated GIFs keep first frame)
    const image = sharp(sourcePath)
    const metadata = await image.metadata()

    const thumbnailBuffer = await image
      .rotate() // apply EXIF orientation
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMBNAIL_QUALITY })
      .toBuffer()

    const thumbnailPath = `projects/${photo.album.projectId}/photos/${photo.album.id}/thumbs/${photoId}.webp`
    await uploadFile(thumbnailPath, thumbnailBuffer, thumbnailBuffer.length, 'image/webp')

    // Web-sized preview for the lightbox — large originals (25-90 MB PNGs)
    // are far too slow to view inline; they remain available for download
    const previewBuffer = await image
      .rotate()
      .resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: PREVIEW_QUALITY })
      .toBuffer()

    const previewPath = `projects/${photo.album.projectId}/photos/${photo.album.id}/previews/${photoId}.webp`
    await uploadFile(previewPath, previewBuffer, previewBuffer.length, 'image/webp')

    // EXIF orientation 5-8 swaps width/height for display
    const orientationSwaps = (metadata.orientation || 1) >= 5
    await prisma.photo.update({
      where: { id: photoId },
      data: {
        fileType: photoMime,
        thumbnailPath,
        previewPath,
        width: (orientationSwaps ? metadata.height : metadata.width) ?? null,
        height: (orientationSwaps ? metadata.width : metadata.height) ?? null,
      },
    })

    logMessage(`[WORKER] Photo ${photoId} processed successfully (${photoMime}, ${metadata.width}x${metadata.height})`)
  } catch (error) {
    logError(`[WORKER ERROR] Photo processing failed for ${photoId}`, error)
    throw error
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch (cleanupError) {
        logError('[WORKER ERROR] Failed to cleanup temp files', cleanupError)
      }
    }
  }
}
