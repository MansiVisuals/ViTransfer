import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { mkdir } from 'fs/promises'

const STORAGE_ROOT = process.env.STORAGE_ROOT || '/app/uploads'

function validatePath(filePath: string): string {
  // Remove any directory traversal attempts
  const sanitized = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '')

  const fullPath = path.join(STORAGE_ROOT, sanitized)
  const realPath = path.resolve(fullPath)
  const realRoot = path.resolve(STORAGE_ROOT)

  // Ensure resolved path is still within storage root
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
