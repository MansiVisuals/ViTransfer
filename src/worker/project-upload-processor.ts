import { Job } from 'bullmq'
import sharp from 'sharp'
import { prisma } from '../lib/db'
import { downloadFile, uploadFile } from '../lib/storage'
import { generateThumbnail, generateWaveformImage } from '../lib/ffmpeg'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { TEMP_DIR } from './cleanup'
import { logError, logMessage } from '../lib/logging'
import type { ProjectUploadProcessingJob } from '../lib/queue'

const DEBUG = process.env.DEBUG_WORKER === 'true'

const THUMBNAIL_SIZE = 512
const THUMBNAIL_QUALITY = 75

/**
 * Generate a webp preview thumbnail for image/video uploads.
 * Best-effort: failures leave thumbnailPath null (UI falls back to a type icon).
 */
async function generateUploadThumbnail(
  uploadId: string,
  projectId: string,
  tempFilePath: string,
  mimeType: string
): Promise<string | null> {
  let frameFilePath: string | undefined

  try {
    let thumbnailBuffer: Buffer

    if (mimeType.startsWith('image/')) {
      thumbnailBuffer = await sharp(tempFilePath)
        .rotate()
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: THUMBNAIL_QUALITY })
        .toBuffer()
    } else if (mimeType.startsWith('video/')) {
      frameFilePath = path.join(TEMP_DIR, `${uploadId}-frame.jpg`)
      await generateThumbnail(tempFilePath, frameFilePath, 1)
      thumbnailBuffer = await sharp(frameFilePath)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: THUMBNAIL_QUALITY })
        .toBuffer()
    } else if (mimeType.startsWith('audio/')) {
      frameFilePath = path.join(TEMP_DIR, `${uploadId}-wave.png`)
      await generateWaveformImage(tempFilePath, frameFilePath)
      thumbnailBuffer = await sharp(frameFilePath)
        .flatten({ background: '#18181b' })
        .webp({ quality: THUMBNAIL_QUALITY })
        .toBuffer()
    } else {
      // Documents, subtitles, archives, project files have no visual content
      // to render — the UI shows a file-type icon instead
      return null
    }

    const thumbnailPath = `projects/${projectId}/uploads/thumbs/${uploadId}.webp`
    await uploadFile(thumbnailPath, thumbnailBuffer, thumbnailBuffer.length, 'image/webp')
    return thumbnailPath
  } catch (error) {
    logError(`[WORKER] Thumbnail generation failed for project upload ${uploadId} (non-fatal)`, error)
    return null
  } finally {
    if (frameFilePath && fs.existsSync(frameFilePath)) {
      try { fs.unlinkSync(frameFilePath) } catch {}
    }
  }
}

/**
 * Process uploaded project file - detect MIME type from file bytes
 * Called after project upload is created
 */
export async function processProjectUpload(job: Job<ProjectUploadProcessingJob>) {
  const { uploadId, storagePath, projectId } = job.data

  logMessage(`[WORKER] Processing project upload ${uploadId}`)

  if (DEBUG) {
    logMessage(`[WORKER DEBUG] Project upload job data: ${JSON.stringify(job.data, null, 2)}`)
  }

  let tempFilePath: string | undefined

  try {
    // Download file to temp location
    tempFilePath = path.join(TEMP_DIR, `${uploadId}-upload`)

    if (DEBUG) {
      logMessage(`[WORKER DEBUG] Downloading project upload from: ${storagePath}`)
      logMessage(`[WORKER DEBUG] Temp file path: ${tempFilePath}`)
    }

    const downloadStream = await downloadFile(storagePath)
    await pipeline(downloadStream, fs.createWriteStream(tempFilePath))

    // Verify file exists and has content
    const stats = fs.statSync(tempFilePath)
    if (stats.size === 0) {
      throw new Error('Downloaded file is empty')
    }

    logMessage(`[WORKER] Downloaded project upload ${uploadId}, size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)

    // Detect MIME type from file bytes
    if (DEBUG) {
      logMessage('[WORKER DEBUG] Detecting MIME type from file bytes...')
    }

    const { fileTypeFromFile } = await import('file-type')
    const fileType = await fileTypeFromFile(tempFilePath)

    let detectedMimeType = 'application/octet-stream'

    if (fileType) {
      detectedMimeType = fileType.mime
      logMessage(`[WORKER] Project upload ${uploadId} MIME type detected: ${detectedMimeType}`)
    } else {
      // Some files (like .txt, .prproj) don't have detectable magic bytes
      logMessage(`[WORKER] Project upload ${uploadId}: Could not detect MIME type from magic bytes, using fallback`)
    }

    // Generate preview thumbnail for image/video uploads (best-effort)
    const thumbnailPath = await generateUploadThumbnail(uploadId, projectId, tempFilePath, detectedMimeType)

    // Update project upload with detected MIME type + thumbnail
    await prisma.projectUpload.update({
      where: { id: uploadId },
      data: {
        fileType: detectedMimeType,
        ...(thumbnailPath ? { thumbnailPath } : {}),
      }
    })

    logMessage(`[WORKER] Project upload ${uploadId} processed successfully (fileType: ${detectedMimeType}${thumbnailPath ? ', thumbnail generated' : ''})`)

  } catch (error) {
    logError(`[WORKER ERROR] Project upload processing failed for ${uploadId}`, error)
    
    // Update upload record to mark error
    try {
      await prisma.projectUpload.update({
        where: { id: uploadId },
        data: {
          fileType: 'ERROR'
        }
      })
    } catch (updateError) {
      logError(`[WORKER ERROR] Failed to update project upload error status`, updateError)
    }

    throw error
  } finally {
    // Cleanup temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath)
        if (DEBUG) {
          logMessage(`[WORKER DEBUG] Cleaned up temp file: ${tempFilePath}`)
        }
      } catch (cleanupErr) {
        logError('[WORKER ERROR] Failed to cleanup temp file:', cleanupErr)
      }
    }
  }
}
