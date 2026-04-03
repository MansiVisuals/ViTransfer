import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import { ReadStream } from 'fs'
import { pipeline } from 'stream/promises'
import { mkdir } from 'fs/promises'
import { s3UploadFile, s3DownloadFile, s3DeleteFile, s3DeleteDirectory } from './s3-storage'

const STORAGE_ROOT = process.env.STORAGE_ROOT || '/app/uploads'

/** True when STORAGE_PROVIDER=s3 is set. */
export function isS3Mode(): boolean {
  return process.env.STORAGE_PROVIDER === 's3'
}

/**
 * Validate a relative storage path against STORAGE_ROOT.
 * Guards against null bytes, URL-encoded traversal, backslashes, and .. sequences.
 */
function validatePath(filePath: string): string {
  if (filePath.includes('\0')) throw new Error('Invalid file path - null byte detected')

  let decoded = filePath
  try {
    decoded = decodeURIComponent(decoded)
    decoded = decodeURIComponent(decoded) // double-decode catches %252e%252e etc.
  } catch {
    decoded = filePath
  }

  decoded = decoded.replace(/\\/g, '/')
  while (decoded.includes('..')) decoded = decoded.replace(/\.\./g, '')

  const fullPath = path.join(STORAGE_ROOT, path.normalize(decoded))
  const realPath = path.resolve(fullPath)
  const realRoot = path.resolve(STORAGE_ROOT)

  if (!realPath.startsWith(realRoot + path.sep) && realPath !== realRoot) {
    throw new Error('Invalid file path - path traversal detected')
  }

  return fullPath
}

export async function initStorage() {
  // S3 mode: bucket must exist; no local directory needed.
  if (isS3Mode()) return
  await mkdir(STORAGE_ROOT, { recursive: true })
}

export async function uploadFile(
  filePath: string,
  stream: Readable | Buffer,
  size: number,
  contentType: string = 'application/octet-stream'
): Promise<void> {
  if (isS3Mode()) {
    await s3UploadFile(filePath, stream, contentType)
    return
  }

  const fullPath = validatePath(filePath)
  const dir = path.dirname(fullPath)

  await mkdir(dir, { recursive: true })

  if (Buffer.isBuffer(stream)) {
    await fs.promises.writeFile(fullPath, stream)
  } else {
    const writeStream = fs.createWriteStream(fullPath)
    await pipeline(stream, writeStream)
  }

  // Verify file was written with correct size
  const stats = await fs.promises.stat(fullPath)
  if (stats.size !== size) {
    await fs.promises.unlink(fullPath).catch(() => {})
    throw new Error(
      `File size mismatch: expected ${size} bytes, got ${stats.size} bytes. ` +
      `Upload may have been corrupted.`
    )
  }
}

export async function downloadFile(filePath: string): Promise<Readable> {
  if (isS3Mode()) {
    return s3DownloadFile(filePath)
  }
  const fullPath = validatePath(filePath)
  return fs.createReadStream(fullPath)
}

export async function deleteFile(filePath: string): Promise<void> {
  if (isS3Mode()) {
    await s3DeleteFile(filePath)
    return
  }
  const fullPath = validatePath(filePath)
  if (fs.existsSync(fullPath)) {
    await fs.promises.unlink(fullPath)
  }
}

export async function deleteDirectory(dirPath: string): Promise<void> {
  if (isS3Mode()) {
    await s3DeleteDirectory(dirPath)
    return
  }
  const fullPath = validatePath(dirPath)
  if (fs.existsSync(fullPath)) {
    await fs.promises.rm(fullPath, { recursive: true, force: true })
  }
}

export function getFilePath(filePath: string): string {
  return validatePath(filePath)
}

const VIDEO_MIME_MAP: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
}

export function getVideoContentType(filename: string): string {
  if (!filename) return 'video/mp4'
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))
  return VIDEO_MIME_MAP[ext] || 'video/mp4'
}

/** Convert a Node.js ReadStream to a Web ReadableStream for NextResponse. */
export function createWebReadableStream(fileStream: ReadStream): ReadableStream {
  return new ReadableStream({
    start(controller) {
      fileStream.on('data', (chunk) => controller.enqueue(chunk))
      fileStream.on('end', () => controller.close())
      fileStream.on('error', (err) => controller.error(err))
    },
    cancel() {
      fileStream.destroy()
    },
  })
}

/** Strip characters unsafe in Content-Disposition headers (CRLF injection, non-ASCII). */
export function sanitizeFilenameForHeader(filename: string): string {
  if (!filename) return 'download.mp4'

  return filename
    .replace(/["\\]/g, '')         // Remove quotes and backslashes
    .replace(/[\r\n]/g, '')        // Remove CRLF (header injection)
    .replace(/[^\x20-\x7E]/g, '_') // Replace non-ASCII with underscore
    .substring(0, 255)             // Limit length to 255 characters
    .trim() || 'download.mp4'      // Fallback if empty after sanitization
}
