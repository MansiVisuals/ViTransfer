import fs from 'fs'
import path from 'path'

const TEMP_DIR = '/tmp/vitransfer'
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

/**
 * Cleanup old temp files to prevent disk space issues
 * Deletes files older than 2 hours (likely from failed jobs)
 */
export async function cleanupOldTempFiles() {
  try {
    const files = await fs.promises.readdir(TEMP_DIR)
    const now = Date.now()

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file)
      try {
        const stats = await fs.promises.stat(filePath)
        const age = now - stats.mtimeMs

        if (age > TWO_HOURS_MS) {
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

/**
 * Ensure temp directory exists on startup
 */
export function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true })
  }
}

export { TEMP_DIR }
