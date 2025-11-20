import { Job } from 'bullmq'
import { VideoProcessingJob } from '../lib/queue'
import {
  TempFiles,
  downloadAndValidateVideo,
  fetchProcessingSettings,
  calculateOutputDimensions,
  processPreview,
  processThumbnail,
  finalizeVideo,
  updateVideoStatus,
  cleanupTempFiles,
  handleProcessingError,
  debugLog
} from './video-processor-helpers'

/**
 * Main video processing orchestrator
 *
 * Stages:
 * 1. Download and validate video file
 * 2. Fetch processing settings from database
 * 3. Calculate output dimensions
 * 4. Process preview with watermark
 * 5. Generate thumbnail
 * 6. Finalize and update database
 * 7. Cleanup temporary files
 */
export async function processVideo(job: Job<VideoProcessingJob>) {
  const { videoId, originalStoragePath, projectId } = job.data

  console.log(`[WORKER] Processing video ${videoId}`)

  debugLog('Job data:', job.data)
  debugLog('Job ID:', job.id)
  debugLog('Job timestamp:', new Date(job.timestamp).toISOString())

  const tempFiles: TempFiles = {}
  const processingStart = Date.now()

  try {
    // Stage 1: Update status to processing
    await updateVideoStatus(videoId, 'PROCESSING', 0)

    // Stage 2: Download and validate video
    const videoInfo = await downloadAndValidateVideo(videoId, originalStoragePath, tempFiles)

    // Stage 3: Fetch processing settings
    const settings = await fetchProcessingSettings(projectId, videoId)

    // Stage 4: Calculate output dimensions
    const dimensions = calculateOutputDimensions(videoInfo.metadata, settings.resolution)

    // Stage 5: Process preview with watermark
    const previewPath = await processPreview(
      videoId,
      projectId,
      videoInfo.path,
      dimensions,
      settings,
      tempFiles,
      videoInfo.metadata.duration
    )

    // Stage 6: Generate and upload thumbnail
    const thumbnailPath = await processThumbnail(
      videoId,
      projectId,
      videoInfo.path,
      videoInfo.metadata.duration,
      tempFiles
    )

    // Stage 7: Finalize - update database with results
    await finalizeVideo(
      videoId,
      previewPath,
      thumbnailPath,
      videoInfo.metadata,
      settings.resolution
    )

    // Success!
    const totalTime = Date.now() - processingStart
    console.log(`[WORKER] Successfully processed video ${videoId} in ${(totalTime / 1000).toFixed(2)}s`)

  } catch (error) {
    // Handle error - update database and log
    await handleProcessingError(videoId, error)
    throw error

  } finally {
    // Always cleanup temp files (success or failure)
    await cleanupTempFiles(tempFiles)
  }
}
