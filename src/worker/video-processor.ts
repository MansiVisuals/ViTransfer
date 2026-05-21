import { Job } from 'bullmq'
import { VideoProcessingJob } from '../lib/queue'
import { logMessage } from '../lib/logging'
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

export async function processVideo(job: Job<VideoProcessingJob>) {
  const { videoId, originalStoragePath, projectId } = job.data

  logMessage(`[WORKER] Processing video ${videoId}`)

  debugLog('Job data:', job.data)
  debugLog('Job ID:', job.id)
  debugLog('Job timestamp:', new Date(job.timestamp).toISOString())

  const tempFiles: TempFiles = {}
  const processingStart = Date.now()

  try {
    // May already be PROCESSING from TUS handler
    logMessage(`[WORKER] Setting video ${videoId} to PROCESSING status (if not already)`)
    await updateVideoStatus(videoId, 'PROCESSING', 0)

    const videoInfo = await downloadAndValidateVideo(videoId, originalStoragePath, tempFiles)

    const settings = await fetchProcessingSettings(projectId, videoId)

    if (settings.skipTranscoding) {
      // Skip transcoding — only extract metadata and generate thumbnail
      logMessage(`[WORKER] Skip transcoding enabled for video ${videoId}, generating thumbnail only`)

      const thumbnailPath = await processThumbnail(
        videoId,
        projectId,
        videoInfo.path,
        videoInfo.metadata.duration,
        tempFiles
      )

      // Finalize without preview path — original file is served directly
      await finalizeVideo(
        videoId,
        '', // No preview path
        thumbnailPath,
        videoInfo.metadata,
        settings.resolution
      )
    } else {
      const dimensions = calculateOutputDimensions(videoInfo.metadata, settings.resolution)

      const previewPath = await processPreview(
        videoId,
        projectId,
        videoInfo.path,
        dimensions,
        settings,
        tempFiles,
        videoInfo.metadata.duration
      )

      const thumbnailPath = await processThumbnail(
        videoId,
        projectId,
        videoInfo.path,
        videoInfo.metadata.duration,
        tempFiles
      )

      await finalizeVideo(
        videoId,
        previewPath,
        thumbnailPath,
        videoInfo.metadata,
        settings.resolution
      )
    }

    const totalTime = Date.now() - processingStart
    logMessage(`[WORKER] Successfully processed video ${videoId} in ${(totalTime / 1000).toFixed(2)}s`)

  } catch (error) {
    await handleProcessingError(videoId, error)
    throw error

  } finally {
    // Always cleanup temp files (success or failure)
    await cleanupTempFiles(tempFiles)
  }
}
