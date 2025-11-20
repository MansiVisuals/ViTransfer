import { Job } from 'bullmq'
import { prisma } from '../lib/db'
import { downloadFile } from '../lib/storage'
import { ALLOWED_ASSET_TYPES } from '../lib/file-validation'
import { fileTypeFromFile } from 'file-type'
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

    const fileType = await fileTypeFromFile(tempFilePath)

    if (!fileType) {
      // Some files (like .prproj, .txt) don't have magic bytes
      console.warn('[ASSET VALIDATION] Could not detect magic bytes for:', tempFilePath)

      await prisma.videoAsset.update({
        where: { id: assetId },
        data: {
          fileType: 'unknown',
          category: expectedCategory || 'other'
        }
      })

      console.log(`[WORKER] Asset ${assetId} processed (no magic bytes detected)`)
      return
    }

    // If expected category is provided, verify the MIME type is compatible with it
    let finalCategory: string

    if (expectedCategory && expectedCategory !== 'other') {
      // Check if the expected category supports this MIME type
      const expectedConfig = ALLOWED_ASSET_TYPES[expectedCategory as keyof typeof ALLOWED_ASSET_TYPES]

      if (expectedConfig && expectedConfig.mimeTypes.includes(fileType.mime)) {
        // Expected category is valid and compatible - use it (preserve manual selection)
        finalCategory = expectedCategory
        console.log(`[WORKER] Asset MIME type ${fileType.mime} is compatible with expected category '${expectedCategory}'`)
      } else {
        // Expected category doesn't support this MIME type - validation failed
        console.error(`[WORKER ERROR] File MIME type '${fileType.mime}' is not compatible with expected category '${expectedCategory}'`)

        await prisma.videoAsset.update({
          where: { id: assetId },
          data: {
            fileType: 'INVALID - ' + fileType.mime
          }
        })

        throw new Error(`File MIME type '${fileType.mime}' is not compatible with expected category '${expectedCategory}'`)
      }
    } else {
      // No expected category - auto-detect from MIME type
      let detectedCategory: string | undefined

      for (const [cat, config] of Object.entries(ALLOWED_ASSET_TYPES)) {
        if (config.mimeTypes.includes(fileType.mime)) {
          detectedCategory = cat
          break
        }
      }

      if (!detectedCategory) {
        console.error(`[WORKER ERROR] File content does not match any allowed asset type. Detected: ${fileType.mime}`)

        await prisma.videoAsset.update({
          where: { id: assetId },
          data: {
            fileType: 'INVALID - ' + fileType.mime
          }
        })

        throw new Error(`File content does not match any allowed asset type. Detected: ${fileType.mime}`)
      }

      finalCategory = detectedCategory
    }

    console.log(`[WORKER] Asset magic byte validation passed - type: ${fileType.mime}, category: ${finalCategory}`)

    // Update asset with detected file type and final category
    await prisma.videoAsset.update({
      where: { id: assetId },
      data: {
        fileType: fileType.mime,
        category: finalCategory
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
