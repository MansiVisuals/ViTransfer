import fs from 'fs'
import path from 'path'
import { logError, logMessage } from '../lib/logging'

const TEMP_DIR = '/tmp/vitransfer'
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

// The same id can be in flight in two queues at once (video + clean preview),
// so count owners rather than flag them
const activeJobs = new Map<string, number>()

export function trackJob(id: string) {
  activeJobs.set(id, (activeJobs.get(id) ?? 0) + 1)
}

export function untrackJob(id: string) {
  const remaining = (activeJobs.get(id) ?? 1) - 1
  if (remaining > 0) activeJobs.set(id, remaining)
  else activeJobs.delete(id)
}

/**
 * Cleanup old temp files to prevent disk space issues
 * Deletes files older than 2 hours that no running job owns
 */
export async function cleanupOldTempFiles() {
  try {
    const files = await fs.promises.readdir(TEMP_DIR)
    const now = Date.now()
    const active = [...activeJobs.keys()]

    for (const file of files) {
      if (active.some((id) => file.includes(id))) continue

      const filePath = path.join(TEMP_DIR, file)
      try {
        const stats = await fs.promises.stat(filePath)
        const age = now - stats.mtimeMs

        if (age > TWO_HOURS_MS) {
          // Recursive: photo jobs decode raws inside a directory of their own
          await fs.promises.rm(filePath, { recursive: true, force: true })
          logMessage(`Cleaned up old temp file: ${file} (${(age / 1000 / 60).toFixed(0)} minutes old)`)
        }
      } catch (err) {
        // File might have been deleted already, skip
      }
    }
  } catch (error) {
    logError('Failed to cleanup old temp files:', error)
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
