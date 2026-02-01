import { Job, Worker } from 'bullmq'
import { prisma } from '../lib/db'
import { getRedisForQueue } from '../lib/redis'
import { getCpuAllocation } from '../lib/cpu-config'
import { transcodeVideo, getVideoMetadata } from '../lib/ffmpeg'
import { downloadFile, uploadFile } from '../lib/storage'
import { CleanPreviewJob } from '../lib/queue'
import { calculateOutputDimensions, RESOLUTION_PRESETS } from './video-processor-helpers'
import { TEMP_DIR } from './cleanup'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'

const DEBUG = process.env.DEBUG_WORKER === 'true'

function debugLog(message: string, data?: any) {
  if (!DEBUG) return
  if (data !== undefined) {
    console.log(`[CLEAN PREVIEW DEBUG] ${message}`, data)
  } else {
    console.log(`[CLEAN PREVIEW DEBUG] ${message}`)
  }
}

/**
 * Process a clean (non-watermarked) preview for approved video playback
 * This is triggered when a video is approved AND the project has usePreviewForApprovedPlayback enabled with watermarks
 */
export async function processCleanPreview(job: Job<CleanPreviewJob>): Promise<void> {
  const { videoId, projectId, originalStoragePath, resolution } = job.data

  console.log(`[CLEAN PREVIEW] Processing clean preview for video ${videoId} at ${resolution}`)

  const tempFiles: { input?: string; output?: string } = {}
  const processingStart = Date.now()

  try {
    // Fetch the video to verify it exists and is approved
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { project: true }
    })

    if (!video) {
      throw new Error(`Video ${videoId} not found`)
    }

    if (!video.approved) {
      console.log(`[CLEAN PREVIEW] Video ${videoId} is not approved, skipping clean preview generation`)
      return
    }

    // Download original file to temp location
    const tempInputPath = path.join(TEMP_DIR, `${videoId}-clean-original`)
    tempFiles.input = tempInputPath

    debugLog('Downloading original file from:', originalStoragePath)

    const downloadStream = await downloadFile(originalStoragePath)
    await pipeline(downloadStream, fs.createWriteStream(tempInputPath))

    console.log(`[CLEAN PREVIEW] Downloaded original file for video ${videoId}`)

    // Get video metadata
    const metadata = await getVideoMetadata(tempInputPath)
    debugLog('Video metadata:', metadata)

    // Calculate output dimensions
    const dimensions = calculateOutputDimensions(metadata, resolution)
    debugLog('Output dimensions:', dimensions)

    // Generate temp output path
    const tempOutputPath = path.join(TEMP_DIR, `${videoId}-clean-${resolution}.mp4`)
    tempFiles.output = tempOutputPath

    // Transcode WITHOUT watermark (watermarkText = undefined)
    console.log(`[CLEAN PREVIEW] Transcoding clean preview for video ${videoId}`)

    await transcodeVideo({
      inputPath: tempInputPath,
      outputPath: tempOutputPath,
      width: dimensions.width,
      height: dimensions.height,
      watermarkText: undefined, // No watermark for clean preview!
      onProgress: async (progress) => {
        await job.updateProgress(progress * 100)
        debugLog(`Transcode progress: ${(progress * 100).toFixed(1)}%`)
      }
    })

    const outputStats = fs.statSync(tempOutputPath)
    console.log(`[CLEAN PREVIEW] Generated clean preview: ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`)

    // Upload to storage
    const storagePath = `projects/${projectId}/videos/${videoId}/preview-clean-${resolution}.mp4`

    debugLog('Uploading to:', storagePath)

    await uploadFile(
      storagePath,
      fs.createReadStream(tempOutputPath),
      outputStats.size,
      'video/mp4'
    )

    // Update database with clean preview path
    const updateField = resolution === '1080p' ? 'cleanPreview1080Path' : 'cleanPreview720Path'
    await prisma.video.update({
      where: { id: videoId },
      data: { [updateField]: storagePath }
    })

    const totalTime = Date.now() - processingStart
    console.log(`[CLEAN PREVIEW] Successfully processed clean preview for video ${videoId} in ${(totalTime / 1000).toFixed(2)}s`)

  } catch (error) {
    console.error(`[CLEAN PREVIEW ERROR] Error processing clean preview for video ${videoId}:`, error)
    throw error

  } finally {
    // Cleanup temp files
    for (const file of Object.values(tempFiles).filter((f): f is string => !!f)) {
      try {
        if (fs.existsSync(file)) {
          await fs.promises.unlink(file)
          debugLog('Cleaned up temp file:', path.basename(file))
        }
      } catch (cleanupError) {
        console.error(`[CLEAN PREVIEW ERROR] Failed to cleanup temp file ${path.basename(file)}:`, cleanupError)
      }
    }
  }
}

/**
 * Create and configure the clean preview worker
 */
export function createCleanPreviewWorker() {
  // Use centralized CPU allocation to coordinate with main video worker
  const cpuAllocation = getCpuAllocation()

  return new Worker<CleanPreviewJob>(
    'clean-preview-processing',
    processCleanPreview,
    {
      connection: getRedisForQueue(),
      concurrency: cpuAllocation.cleanPreviewConcurrency,
    }
  )
}
