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
    await s3UploadFile(filePath, stream, contentType, size)
    return
  }

  const fullPath = validatePath(filePath)
  const dir = path.dirname(fullPath)

  await mkdir(dir, { recursive: true })

  const inputStream = Buffer.isBuffer(stream) ? Readable.from(stream) : stream
  const writeStream = fs.createWriteStream(fullPath)
  await pipeline(inputStream, writeStream)

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

/**
 * Move a file from a temporary path into final storage.
 *
 * - In FS mode: tries `fs.rename` first (O(1) when on the same filesystem,
 *   typical Docker setup). On `EXDEV` (cross-filesystem mount, e.g. when
 *   STORAGE_ROOT is on a separate volume) falls back to streaming copy +
 *   unlink.
 * - In S3 mode: streams the temp file into the bucket, then deletes the temp.
 *
 * Used by the TUS upload finish handlers — replaces the previous pattern of
 * re-streaming the temp file through `uploadFile()` (which always pipelined
 * a full copy even when a rename would do).
 */
export async function moveFile(
  tempPath: string,
  finalPath: string,
  size: number,
  contentType: string = 'application/octet-stream'
): Promise<void> {
  if (isS3Mode()) {
    const stream = fs.createReadStream(tempPath)
    try {
      await s3UploadFile(finalPath, stream, contentType, size)
    } finally {
      await fs.promises.unlink(tempPath).catch(() => {})
    }
    return
  }

  const fullPath = validatePath(finalPath)
  await mkdir(path.dirname(fullPath), { recursive: true })

  try {
    await fs.promises.rename(tempPath, fullPath)
  } catch (err: any) {
    if (err?.code !== 'EXDEV') throw err
    // Cross-device — copy then unlink
    await fs.promises.copyFile(tempPath, fullPath)
    await fs.promises.unlink(tempPath).catch(() => {})
  }

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

/** Convert a Node.js ReadStream to a Web ReadableStream for NextResponse.
 *
 * Manual implementation with proper backpressure:
 *   - Each Node `data` event is enqueued straight to the controller.
 *   - If the controller's queue is saturated (`desiredSize <= 0`), pause
 *     the underlying ReadStream so we don't buffer the whole file in RAM.
 *   - When the consumer pulls, resume Node so it emits the next chunk.
 *
 * Prefer this over `Readable.toWeb()` here: that adapter returns a byte
 * (BYOB) stream which adds per-chunk overhead in the Next.js response
 * pipeline and was measurably slower behind a Cloudflare tunnel.
 */
export function createWebReadableStream(fileStream: ReadStream): ReadableStream {
  let closed = false
  return new ReadableStream({
    start(controller) {
      fileStream.on('data', (chunk) => {
        if (closed) return
        controller.enqueue(chunk)
        // Backpressure: pause Node when the Web stream's queue is full.
        if (controller.desiredSize !== null && controller.desiredSize <= 0) {
          fileStream.pause()
        }
      })
      fileStream.on('end', () => {
        if (closed) return
        closed = true
        try { controller.close() } catch { /* already closed */ }
      })
      fileStream.on('error', (err) => {
        if (closed) return
        closed = true
        try { controller.error(err) } catch { /* already errored */ }
      })
    },
    pull() {
      // Consumer is ready for more — resume Node's reader.
      fileStream.resume()
    },
    cancel() {
      closed = true
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
