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

  console.log(`Processing video ${videoId}`)

  // Declare temp paths outside try block for cleanup in catch
  let tempInputPath: string | undefined
  let tempPreviewPath: string | undefined
  let tempThumbnailPath: string | undefined

  try {
    // Update status to processing
    await prisma.video.update({
      where: { id: videoId },
      data: { status: 'PROCESSING', processingProgress: 0 },
    })

    // Download original file to temp location
    tempInputPath = path.join(TEMP_DIR, `${videoId}-original`)
    const downloadStream = await downloadFile(originalStoragePath)
    await pipeline(downloadStream, fs.createWriteStream(tempInputPath))

    console.log(`Downloaded original file for video ${videoId}`)

    // Verify file exists and has content
    const stats = fs.statSync(tempInputPath)
    if (stats.size === 0) {
      throw new Error('Downloaded file is empty')
    }

    console.log(`Downloaded file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)

    // Get video metadata
    const metadata = await getVideoMetadata(tempInputPath)
    console.log(`Video metadata:`, metadata)

    // Get project and video details for watermark and settings
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

    // Use custom watermark text or default format (only if watermarks are enabled)
    const watermarkText = project?.watermarkEnabled
      ? (project.watermarkText || `PREVIEW-${project.title || 'PROJECT'}-${video?.versionLabel || 'v1'}`)
      : undefined

    // Detect if video is vertical (portrait) or horizontal (landscape)
    const isVertical = metadata.height > metadata.width
    const aspectRatio = metadata.width / metadata.height

    console.log(`Video orientation: ${isVertical ? 'vertical' : 'horizontal'} (${metadata.width}x${metadata.height}, ratio: ${aspectRatio.toFixed(2)})`)

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

    console.log(`Output resolution: ${outputWidth}x${outputHeight}`)

    // Generate preview with watermark
    tempPreviewPath = path.join(TEMP_DIR, `${videoId}-preview.mp4`)
    await transcodeVideo({
      inputPath: tempInputPath,
      outputPath: tempPreviewPath,
      width: outputWidth,
      height: outputHeight,
      watermarkText,
      onProgress: async (progress) => {
        await prisma.video.update({
          where: { id: videoId },
          data: { processingProgress: progress * 0.8 },
        })
      },
    })

    console.log(`Generated ${resolution} preview for video ${videoId}`)

    // Upload preview
    const previewPath = `projects/${projectId}/videos/${videoId}/preview-${resolution}.mp4`
    const statsPreview = fs.statSync(tempPreviewPath)
    await uploadFile(
      previewPath,
      fs.createReadStream(tempPreviewPath),
      statsPreview.size,
      'video/mp4'
    )

    // Generate thumbnail
    tempThumbnailPath = path.join(TEMP_DIR, `${videoId}-thumb.jpg`)
    await generateThumbnail(tempInputPath, tempThumbnailPath, 10)

    console.log(`Generated thumbnail for video ${videoId}`)

    // Upload thumbnail
    const thumbnailPath = `projects/${projectId}/videos/${videoId}/thumbnail.jpg`
    const statsThumbnail = fs.statSync(tempThumbnailPath)
    await uploadFile(
      thumbnailPath,
      fs.createReadStream(tempThumbnailPath),
      statsThumbnail.size,
      'image/jpeg'
    )

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

    await prisma.video.update({
      where: { id: videoId },
      data: updateData,
    })

    // Cleanup temp files with proper async error handling
    const cleanupFiles = [tempInputPath, tempPreviewPath, tempThumbnailPath]
    for (const file of cleanupFiles) {
      try {
        if (fs.existsSync(file)) {
          await fs.promises.unlink(file)
          console.log(`Cleaned up temp file: ${path.basename(file)}`)
        }
      } catch (cleanupError) {
        console.error(`Failed to cleanup temp file ${path.basename(file)}:`, cleanupError)
        // Continue cleanup - don't let one failure stop the others
      }
    }

    console.log(`Successfully processed video ${videoId}`)
  } catch (error) {
    console.error(`Error processing video ${videoId}:`, error)

    // Cleanup temp files even on error
    const cleanupFiles = [tempInputPath, tempPreviewPath, tempThumbnailPath].filter((f): f is string => !!f)
    for (const file of cleanupFiles) {
      try {
        if (fs.existsSync(file)) {
          await fs.promises.unlink(file)
        }
      } catch (cleanupError) {
        console.error(`Failed to cleanup temp file after error:`, cleanupError)
      }
    }

    // Update video with error
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: 'ERROR',
        processingError: error instanceof Error ? error.message : 'Unknown error',
      },
    })

    throw error
  }
}

async function main() {
  console.log('Initializing video processing worker...')

  // Initialize storage
  await initStorage()

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

  console.log(`Worker concurrency: ${concurrency} (based on ${cpuCores} CPU cores)`)

  const worker = new Worker<VideoProcessingJob>('video-processing', processVideo, {
    connection: getConnection(),
    concurrency,
    limiter: {
      max: concurrency * 10, // Max jobs per time window
      duration: 60000, // 1 minute window (prevents overload)
    },
  })

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err)
  })

  console.log('Video processing worker started')

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
