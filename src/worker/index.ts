import { Worker, Job } from 'bullmq'
import { getConnection, VideoProcessingJob } from '../lib/queue'
import { prisma } from '../lib/db'
import { downloadFile, uploadFile, initStorage } from '../lib/storage'
import { transcodeVideo, generateThumbnail, getVideoMetadata } from '../lib/ffmpeg'
import { runCleanup } from '../lib/upload-cleanup'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { pipeline } from 'stream/promises'

// Debug mode - outputs verbose worker logs
const DEBUG = true // Always enabled for main-debug branch

const TEMP_DIR = '/tmp/vitransfer'

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
}

// Helper function to cleanup old temp files (prevents disk space issues)
async function cleanupOldTempFiles() {
  try {
    const files = await fs.promises.readdir(TEMP_DIR)
    const now = Date.now()
    const maxAge = 2 * 60 * 60 * 1000 // 2 hours

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file)
      try {
        const stats = await fs.promises.stat(filePath)
        const age = now - stats.mtimeMs

        // Delete files older than 2 hours (likely from failed jobs)
        if (age > maxAge) {
          await fs.promises.unlink(filePath)
          console.log(`Cleaned up old temp file: ${file} (${(age / 1000 / 60).toFixed(0)} minutes old)`)
        }
      } catch (err) {
        // File might have been deleted already, skip
      }
    }
  } catch (error) {
    console.error('Failed to cleanup old temp files:', error)
  }
}

async function processVideo(job: Job<VideoProcessingJob>) {
  const { videoId, originalStoragePath, projectId } = job.data

  console.log(`[WORKER] Processing video ${videoId}`)

  if (DEBUG) {
    console.log('[WORKER DEBUG] Job data:', JSON.stringify(job.data, null, 2))
    console.log('[WORKER DEBUG] Job ID:', job.id)
    console.log('[WORKER DEBUG] Job timestamp:', new Date(job.timestamp).toISOString())
  }

  // Declare temp paths outside try block for cleanup in catch
  let tempInputPath: string | undefined
  let tempPreviewPath: string | undefined
  let tempThumbnailPath: string | undefined

  try {
    // Update status to processing
    if (DEBUG) {
      console.log('[WORKER DEBUG] Updating video status to PROCESSING...')
    }

    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'PROCESSING', processingProgress: 0 },
    })

    if (DEBUG) {
      console.log('[WORKER DEBUG] Database updated to PROCESSING status')
    }

    // Download original file to temp location
    tempInputPath = path.join(TEMP_DIR, `${videoId}-original`)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Downloading original file from:', originalStoragePath)
      console.log('[WORKER DEBUG] Temp input path:', tempInputPath)
    }

    const downloadStart = Date.now()
    const downloadStream = await downloadFile(originalStoragePath)
    await pipeline(downloadStream, fs.createWriteStream(tempInputPath))
    const downloadTime = Date.now() - downloadStart

    console.log(`[WORKER] Downloaded original file for video ${videoId} in ${(downloadTime / 1000).toFixed(2)}s`)

    // Verify file exists and has content
    const stats = fs.statSync(tempInputPath)
    if (stats.size === 0) {
      throw new Error('Downloaded file is empty')
    }

    console.log(`[WORKER] Downloaded file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)

    if (DEBUG) {
      console.log('[WORKER DEBUG] File verification passed')
      console.log('[WORKER DEBUG] Download speed:', (stats.size / 1024 / 1024 / (downloadTime / 1000)).toFixed(2), 'MB/s')
    }

    // Get video metadata
    if (DEBUG) {
      console.log('[WORKER DEBUG] Getting video metadata...')
    }

    const metadataStart = Date.now()
    const metadata = await getVideoMetadata(tempInputPath)
    const metadataTime = Date.now() - metadataStart

    console.log(`[WORKER] Video metadata:`, metadata)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Metadata extraction took:', (metadataTime / 1000).toFixed(2), 's')
    }

    // Get project and video details for watermark and settings
    if (DEBUG) {
      console.log('[WORKER DEBUG] Fetching project and video details...')
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        title: true,
        previewResolution: true,
        watermarkEnabled: true,
        watermarkText: true,
      },
    })

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { versionLabel: true },
    })

    if (DEBUG) {
      console.log('[WORKER DEBUG] Project settings:', {
        title: project?.title,
        previewResolution: project?.previewResolution,
        watermarkEnabled: project?.watermarkEnabled,
        watermarkText: project?.watermarkText
      })
      console.log('[WORKER DEBUG] Video version label:', video?.versionLabel)
    }

    // Use custom watermark text or default format (only if watermarks are enabled)
    const watermarkText = project?.watermarkEnabled
      ? (project.watermarkText || `PREVIEW-${project.title || 'PROJECT'}-${video?.versionLabel || 'v1'}`)
      : undefined

    if (DEBUG) {
      console.log('[WORKER DEBUG] Final watermark text:', watermarkText || '(no watermark)')
    }

    // Detect if video is vertical (portrait) or horizontal (landscape)
    const isVertical = metadata.height > metadata.width
    const aspectRatio = metadata.width / metadata.height

    console.log(`[WORKER] Video orientation: ${isVertical ? 'vertical' : 'horizontal'} (${metadata.width}x${metadata.height}, ratio: ${aspectRatio.toFixed(2)})`)

    // Calculate output dimensions based on resolution setting and orientation
    let outputWidth: number
    let outputHeight: number

    const resolution = project?.previewResolution || '720p'

    if (resolution === '720p') {
      if (isVertical) {
        // For vertical videos, 720p means 720 width (portrait)
        outputWidth = 720
        // Ensure height is even (required for H.264 encoding)
        outputHeight = Math.round(720 / aspectRatio / 2) * 2
      } else {
        // For horizontal videos, 720p means 1280x720
        outputWidth = 1280
        outputHeight = 720
      }
    } else {
      // 1080p
      if (isVertical) {
        // For vertical videos, 1080p means 1080 width (portrait)
        outputWidth = 1080
        // Ensure height is even (required for H.264 encoding)
        outputHeight = Math.round(1080 / aspectRatio / 2) * 2
      } else {
        // For horizontal videos, 1080p means 1920x1080
        outputWidth = 1920
        outputHeight = 1080
      }
    }

    console.log(`[WORKER] Output resolution: ${outputWidth}x${outputHeight}`)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Resolution details:', {
        setting: resolution,
        isVertical,
        inputDimensions: `${metadata.width}x${metadata.height}`,
        outputDimensions: `${outputWidth}x${outputHeight}`,
        aspectRatio
      })
    }

    // Generate preview with watermark
    tempPreviewPath = path.join(TEMP_DIR, `${videoId}-preview.mp4`)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Starting video transcoding...')
      console.log('[WORKER DEBUG] Temp preview path:', tempPreviewPath)
    }

    const transcodeStart = Date.now()
    await transcodeVideo({
      inputPath: tempInputPath,
      outputPath: tempPreviewPath,
      width: outputWidth,
      height: outputHeight,
      watermarkText,
      onProgress: async (progress) => {
        if (DEBUG) {
          console.log(`[WORKER DEBUG] Transcode progress: ${(progress * 100).toFixed(1)}%`)
        }
        await prisma.video.update({
          where: { id: videoId },
          data: { processingProgress: progress * 0.8 },
        })
      },
    })
    const transcodeTime = Date.now() - transcodeStart

    console.log(`[WORKER] Generated ${resolution} preview for video ${videoId} in ${(transcodeTime / 1000).toFixed(2)}s`)

    if (DEBUG) {
      const transcodeStats = fs.statSync(tempPreviewPath)
      console.log('[WORKER DEBUG] Transcoded file size:', (transcodeStats.size / 1024 / 1024).toFixed(2), 'MB')
      console.log('[WORKER DEBUG] Size reduction:', ((1 - transcodeStats.size / stats.size) * 100).toFixed(1), '%')
    }

    // Upload preview
    const previewPath = `projects/${projectId}/videos/${videoId}/preview-${resolution}.mp4`
    const statsPreview = fs.statSync(tempPreviewPath)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Uploading preview to:', previewPath)
      console.log('[WORKER DEBUG] Preview file size:', (statsPreview.size / 1024 / 1024).toFixed(2), 'MB')
    }

    const uploadStart = Date.now()
    await uploadFile(
      previewPath,
      fs.createReadStream(tempPreviewPath),
      statsPreview.size,
      'video/mp4'
    )
    const uploadTime = Date.now() - uploadStart

    if (DEBUG) {
      console.log('[WORKER DEBUG] Preview uploaded in:', (uploadTime / 1000).toFixed(2), 's')
      console.log('[WORKER DEBUG] Upload speed:', (statsPreview.size / 1024 / 1024 / (uploadTime / 1000)).toFixed(2), 'MB/s')
    }

    // Generate thumbnail
    tempThumbnailPath = path.join(TEMP_DIR, `${videoId}-thumb.jpg`)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Generating thumbnail...')
      console.log('[WORKER DEBUG] Temp thumbnail path:', tempThumbnailPath)
    }

    const thumbStart = Date.now()
    await generateThumbnail(tempInputPath, tempThumbnailPath, 10)
    const thumbTime = Date.now() - thumbStart

    console.log(`[WORKER] Generated thumbnail for video ${videoId} in ${(thumbTime / 1000).toFixed(2)}s`)

    // Upload thumbnail
    const thumbnailPath = `projects/${projectId}/videos/${videoId}/thumbnail.jpg`
    const statsThumbnail = fs.statSync(tempThumbnailPath)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Uploading thumbnail to:', thumbnailPath)
      console.log('[WORKER DEBUG] Thumbnail file size:', (statsThumbnail.size / 1024).toFixed(2), 'KB')
    }

    const thumbUploadStart = Date.now()
    await uploadFile(
      thumbnailPath,
      fs.createReadStream(tempThumbnailPath),
      statsThumbnail.size,
      'image/jpeg'
    )
    const thumbUploadTime = Date.now() - thumbUploadStart

    if (DEBUG) {
      console.log('[WORKER DEBUG] Thumbnail uploaded in:', (thumbUploadTime / 1000).toFixed(2), 's')
    }

    // Update video record - store preview in appropriate field based on resolution
    const updateData: any = {
      status: 'READY',
      processingProgress: 100,
      thumbnailPath,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
      codec: metadata.codec,
    }

    // Store preview path in correct field
    if (resolution === '720p') {
      updateData.preview720Path = previewPath
    } else {
      updateData.preview1080Path = previewPath
    }

    if (DEBUG) {
      console.log('[WORKER DEBUG] Updating database with final video data...')
      console.log('[WORKER DEBUG] Update data:', JSON.stringify(updateData, null, 2))
    }

    await prisma.video.update({
      where: { id: videoId },
      data: updateData,
    })

    if (DEBUG) {
      console.log('[WORKER DEBUG] Database updated to READY status')
    }

    // Cleanup temp files with proper async error handling
    if (DEBUG) {
      console.log('[WORKER DEBUG] Starting temp file cleanup...')
    }

    const cleanupFiles = [tempInputPath, tempPreviewPath, tempThumbnailPath]
    for (const file of cleanupFiles) {
      try {
        if (fs.existsSync(file)) {
          const fileStats = fs.statSync(file)
          await fs.promises.unlink(file)
          console.log(`[WORKER] Cleaned up temp file: ${path.basename(file)}`)
          if (DEBUG) {
            console.log('[WORKER DEBUG] Freed disk space:', (fileStats.size / 1024 / 1024).toFixed(2), 'MB')
          }
        }
      } catch (cleanupError) {
        console.error(`[WORKER ERROR] Failed to cleanup temp file ${path.basename(file)}:`, cleanupError)
        // Continue cleanup - don't let one failure stop the others
      }
    }

    const totalTime = Date.now() - downloadStart
    console.log(`[WORKER] Successfully processed video ${videoId} in ${(totalTime / 1000).toFixed(2)}s`)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Processing breakdown:')
      console.log('[WORKER DEBUG]   - Download:', (downloadTime / 1000).toFixed(2), 's')
      console.log('[WORKER DEBUG]   - Metadata:', (metadataTime / 1000).toFixed(2), 's')
      console.log('[WORKER DEBUG]   - Transcode:', (transcodeTime / 1000).toFixed(2), 's')
      console.log('[WORKER DEBUG]   - Thumbnail:', (thumbTime / 1000).toFixed(2), 's')
      console.log('[WORKER DEBUG]   - Upload:', ((uploadTime + thumbUploadTime) / 1000).toFixed(2), 's')
    }
  } catch (error) {
    console.error(`[WORKER ERROR] Error processing video ${videoId}:`, error)

    if (DEBUG) {
      console.error('[WORKER DEBUG] Full error stack:', error instanceof Error ? error.stack : error)
    }

    // Cleanup temp files even on error
    if (DEBUG) {
      console.log('[WORKER DEBUG] Cleaning up temp files after error...')
    }

    const cleanupFiles = [tempInputPath, tempPreviewPath, tempThumbnailPath].filter((f): f is string => !!f)
    for (const file of cleanupFiles) {
      try {
        if (fs.existsSync(file)) {
          await fs.promises.unlink(file)
          if (DEBUG) {
            console.log('[WORKER DEBUG] Cleaned up:', path.basename(file))
          }
        }
      } catch (cleanupError) {
        console.error(`[WORKER ERROR] Failed to cleanup temp file after error:`, cleanupError)
      }
    }

    // Update video with error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (DEBUG) {
      console.log('[WORKER DEBUG] Updating database with error status...')
      console.log('[WORKER DEBUG] Error message:', errorMessage)
    }

    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'ERROR',
        processingError: errorMessage,
      },
    })

    throw error
  }
}

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

  // Initialize storage
  if (DEBUG) {
    console.log('[WORKER DEBUG] Initializing storage...')
  }

  await initStorage()

  if (DEBUG) {
    console.log('[WORKER DEBUG] Storage initialized')
  }

  // Calculate optimal concurrency based on available CPU cores
  // - 1-2 cores: 1 video at a time (low-end systems)
  // - 3-4 cores: 1 video at a time (mid-range systems, encoding is CPU intensive)
  // - 5-8 cores: 2 videos at a time (good balance)
  // - 9+ cores: 3 videos at a time (high-end systems)
  const cpuCores = os.cpus().length
  let concurrency = 2 // Default to 2
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
      max: concurrency * 10, // Max jobs per time window
      duration: 60000, // 1 minute window (prevents overload)
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
  }, 6 * 60 * 60 * 1000) // 6 hours in milliseconds

  // Schedule temp file cleanup every hour (more frequent for disk space)
  const tempCleanupInterval = setInterval(async () => {
    console.log('Running scheduled temp file cleanup...')
    await cleanupOldTempFiles()
  }, 60 * 60 * 1000) // 1 hour in milliseconds

  // Handle shutdown gracefully
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing worker...')
    clearInterval(tusCleanupInterval)
    clearInterval(tempCleanupInterval)
    await worker.close()
    process.exit(0)
  })

  process.on('SIGINT', async () => {
    console.log('SIGINT received, closing worker...')
    clearInterval(tusCleanupInterval)
    clearInterval(tempCleanupInterval)
    await worker.close()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Worker error:', err)
  process.exit(1)
})
