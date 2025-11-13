import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { mkdir } from 'fs/promises'

const STORAGE_ROOT = process.env.STORAGE_ROOT || '/app/uploads'

/**
 * Validate and sanitize file paths to prevent path traversal attacks
 * Defense-in-depth validation against multiple attack vectors
 *
 * @param filePath - The file path to validate
 * @returns Validated absolute path within storage root
 * @throws Error if path traversal is detected
 */
function validatePath(filePath: string): string {
  // 1. Reject null bytes (common in path traversal exploits)
  if (filePath.includes('\0')) {
    throw new Error('Invalid file path - null byte detected')
  }

  // 2. URL decode to catch encoded path traversal attempts (%2e%2e%2f, etc.)
  let decoded = filePath
  try {
    decoded = decodeURIComponent(filePath)
    // Double-decode to catch double-encoding attacks
    decoded = decodeURIComponent(decoded)
  } catch (error) {
    // If decode fails, use original (might be already decoded)
    decoded = filePath
  }

  // 3. Normalize path separators (convert backslashes to forward slashes)
  decoded = decoded.replace(/\\/g, '/')

  // 4. Remove any .. sequences anywhere in the path
  decoded = decoded.replace(/\.\./g, '')

  // 5. Normalize the path to resolve any remaining . or .. sequences
  const sanitized = path.normalize(decoded)

  // 6. Build the full path and resolve it
  const fullPath = path.join(STORAGE_ROOT, sanitized)
  const realPath = path.resolve(fullPath)
  const realRoot = path.resolve(STORAGE_ROOT)

  // 7. Final check: ensure resolved path is within storage root
  if (!realPath.startsWith(realRoot + path.sep) && realPath !== realRoot) {
    throw new Error('Invalid file path - path traversal detected')
  }

  return fullPath
}

export async function initStorage() {
  await mkdir(STORAGE_ROOT, { recursive: true })
}

export async function uploadFile(
  filePath: string,
  stream: Readable | Buffer,
  size: number,
  contentType: string = 'application/octet-stream'
): Promise<void> {
  const fullPath = validatePath(filePath)
  const dir = path.dirname(fullPath)

  await mkdir(dir, { recursive: true })

  // Use pipeline for proper stream handling with backpressure and error propagation
  if (Buffer.isBuffer(stream)) {
    // For buffers, write directly
    await fs.promises.writeFile(fullPath, stream)
  } else {
    // For streams, use pipeline which properly handles:
    // - Backpressure between read and write streams
    // - Error propagation from both streams
    // - Cleanup on errors
    // - Waits for both streams to complete before resolving
    const writeStream = fs.createWriteStream(fullPath)
    await pipeline(stream, writeStream)
  }

  // Verify file was written with correct size
  const stats = await fs.promises.stat(fullPath)
  if (stats.size !== size) {
    // Clean up corrupted file
    await fs.promises.unlink(fullPath).catch(() => {})
    throw new Error(
      `File size mismatch: expected ${size} bytes, got ${stats.size} bytes. ` +
      `Upload may have been corrupted.`
    )
  }
}

export async function downloadFile(filePath: string): Promise<Readable> {
  const fullPath = validatePath(filePath)
  return fs.createReadStream(fullPath)
}

export async function deleteFile(filePath: string): Promise<void> {
  const fullPath = validatePath(filePath)
  if (fs.existsSync(fullPath)) {
    await fs.promises.unlink(fullPath)
  }
}

export async function deleteDirectory(dirPath: string): Promise<void> {
  const fullPath = validatePath(dirPath)
  if (fs.existsSync(fullPath)) {
    await fs.promises.rm(fullPath, { recursive: true, force: true })
  }
}

export function getFilePath(filePath: string): string {
  return validatePath(filePath)
}

/**
 * Sanitize filename for Content-Disposition header
 * Prevents CRLF injection and other header injection attacks
 *
 * @param filename - The filename to sanitize
 * @returns Sanitized filename safe for HTTP headers
 */
export function sanitizeFilenameForHeader(filename: string): string {
  if (!filename) return 'download.mp4'

  return filename
    .replace(/["\\]/g, '')         // Remove quotes and backslashes
    .replace(/[\r\n]/g, '')        // Remove CRLF (header injection)
    .replace(/[^\x20-\x7E]/g, '_') // Replace non-ASCII with underscore
    .substring(0, 255)             // Limit length to 255 characters
    .trim() || 'download.mp4'      // Fallback if empty after sanitization
}
