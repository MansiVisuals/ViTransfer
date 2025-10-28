import fs from 'fs'
import path from 'path'
import { prisma } from './db'

const TUS_UPLOAD_DIR = '/tmp/vitransfer-tus-uploads'
const MAX_AGE_HOURS = 24 // Remove files older than 24 hours

/**
 * Clean up orphaned upload files
 * This should be run periodically (e.g., via cron job)
 */
export async function cleanupOrphanedUploads() {
  if (!fs.existsSync(TUS_UPLOAD_DIR)) {
    return
  }

  try {
    const files = fs.readdirSync(TUS_UPLOAD_DIR)
    const now = Date.now()
    let cleanedCount = 0
    let skippedCount = 0

    for (const file of files) {
      try {
        const filePath = path.join(TUS_UPLOAD_DIR, file)
        const stats = fs.statSync(filePath)

        // Skip if not a file
        if (!stats.isFile()) {
          continue
        }

        // Calculate age in hours
        const ageMs = now - stats.mtimeMs
        const ageHours = ageMs / (1000 * 60 * 60)

        // Remove files older than MAX_AGE_HOURS
        if (ageHours > MAX_AGE_HOURS) {
          fs.unlinkSync(filePath)
          cleanedCount++

          // Also check for .info file and remove it
          const infoPath = `${filePath}.info`
          if (fs.existsSync(infoPath)) {
            fs.unlinkSync(infoPath)
          }
        } else {
          skippedCount++
        }
      } catch (error) {
        console.error(`[Upload Cleanup] Error processing file ${file}:`, error)
      }
    }
  } catch (error) {
    console.error('[Upload Cleanup] Error during cleanup:', error)
  }
}

/**
 * Clean up failed/stuck uploads from database
 * Marks videos as ERROR if they've been in UPLOADING state for too long
 */
export async function cleanupStuckUploads() {
  try {
    // Find videos stuck in UPLOADING state for more than 24 hours
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const stuckVideos = await prisma.video.findMany({
      where: {
        status: 'UPLOADING',
        createdAt: {
          lt: cutoffDate
        }
      }
    })

    if (stuckVideos.length === 0) {
      return
    }

    // Mark them as ERROR
    for (const video of stuckVideos) {
      await prisma.video.update({
        where: { id: video.id },
        data: { status: 'ERROR' }
      })
    }
  } catch (error) {
    console.error('[Upload Cleanup] Error during stuck upload cleanup:', error)
  }
}

/**
 * Run all cleanup tasks
 */
export async function runCleanup() {
  await cleanupOrphanedUploads()
  await cleanupStuckUploads()
}
