import { Job } from 'bullmq'
import { prisma } from '../lib/db'
import { downloadFile } from '../lib/storage'
import { validateAssetMagicBytes } from '../lib/file-validation'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { TEMP_DIR } from './cleanup'

const DEBUG = process.env.DEBUG_WORKER === 'true'

export interface AssetProcessingJob {
  assetId: string
  storagePath: string
  expectedCategory?: string
}

/**
 * Process uploaded asset - validate magic bytes
 * Called after TUS upload completes
 */
export async function processAsset(job: Job<AssetProcessingJob>) {
  const { assetId, storagePath, expectedCategory } = job.data

  console.log(`[WORKER] Processing asset ${assetId}`)

  if (DEBUG) {
    console.log('[WORKER DEBUG] Asset job data:', JSON.stringify(job.data, null, 2))
  }

  let tempFilePath: string | undefined

  try {
    // Download asset to temp location
    tempFilePath = path.join(TEMP_DIR, `${assetId}-asset`)

    if (DEBUG) {
      console.log('[WORKER DEBUG] Downloading asset from:', storagePath)
      console.log('[WORKER DEBUG] Temp file path:', tempFilePath)
    }

    const downloadStream = await downloadFile(storagePath)
    await pipeline(downloadStream, fs.createWriteStream(tempFilePath))

    // Verify file exists and has content
    const stats = fs.statSync(tempFilePath)
    if (stats.size === 0) {
      throw new Error('Downloaded file is empty')
    }

    console.log(`[WORKER] Downloaded asset ${assetId}, size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)

    // Validate magic bytes
    if (DEBUG) {
      console.log('[WORKER DEBUG] Validating asset magic bytes...')
    }

    const magicByteValidation = await validateAssetMagicBytes(tempFilePath, expectedCategory)

    if (!magicByteValidation.valid) {
      console.error(`[WORKER ERROR] Asset magic byte validation failed: ${magicByteValidation.error}`)

      // Update asset record to mark as invalid
      await prisma.videoAsset.update({
        where: { id: assetId },
        data: {
          fileType: 'INVALID - ' + (magicByteValidation.detectedType || 'unknown')
        }
      })

      throw new Error(`Invalid asset file: ${magicByteValidation.error}`)
    }

    console.log(`[WORKER] Asset magic byte validation passed - type: ${magicByteValidation.detectedType}`)

    // Update asset with detected file type and category
    await prisma.videoAsset.update({
      where: { id: assetId },
      data: {
        fileType: magicByteValidation.detectedType || 'application/octet-stream',
        category: magicByteValidation.detectedCategory || expectedCategory || 'other'
      }
    })

    console.log(`[WORKER] Asset ${assetId} processed successfully`)

  } catch (error) {
    console.error(`[WORKER ERROR] Asset processing failed for ${assetId}:`, error)
    throw error
  } finally {
    // Cleanup temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath)
        if (DEBUG) {
          console.log('[WORKER DEBUG] Cleaned up temp file:', tempFilePath)
        }
      } catch (cleanupError) {
        console.error('[WORKER ERROR] Failed to cleanup temp file:', cleanupError)
      }
    }
  }
}
