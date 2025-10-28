import { Server } from '@tus/server'
import { FileStore } from '@tus/file-store'
import { prisma } from '@/lib/db'
import { videoQueue } from '@/lib/queue'
import path from 'path'
import fs from 'fs'
import { Readable } from 'stream'
import type { NextApiRequest, NextApiResponse } from 'next'

// TUS upload directory
const TUS_UPLOAD_DIR = '/tmp/vitransfer-tus-uploads'

// Ensure upload directory exists
if (!fs.existsSync(TUS_UPLOAD_DIR)) {
  fs.mkdirSync(TUS_UPLOAD_DIR, { recursive: true })
}

// Configure TUS server with file store
const tusServer = new Server({
  path: '/api/uploads',
  datastore: new FileStore({
    directory: TUS_UPLOAD_DIR,
  }),

  // No file size limit - self-hosted platform
  maxSize: Infinity,

  // Respect forwarded headers for HTTPS/proxy setups
  respectForwardedHeaders: true,

  // IMPORTANT: Disable body parsing to let TUS handle raw streams
  // This ensures the request body isn't consumed before TUS can read it
  relativeLocation: true,

  // Security: Validate file size and videoId before upload starts
  async onUploadCreate(req, upload) {
    try {
      // SECURITY: Require admin authentication for all TUS operations
      // Extract session cookie from request headers
      const cookieHeader = req.headers.get('cookie')
      const sessionCookie = cookieHeader?.split(';').find(c => c.trim().startsWith('vitransfer_session='))?.split('=')[1]

      if (!sessionCookie) {
        throw {
          status_code: 401,
          body: 'Authentication required'
        }
      }

      // Verify the session token
      const { verifyAccessToken } = await import('@/lib/auth')
      const payload = await verifyAccessToken(sessionCookie)

      if (!payload || payload.role !== 'ADMIN') {
        throw {
          status_code: 403,
          body: 'Admin access required'
        }
      }

      // SECURITY: Validate videoId exists in metadata
      const videoId = upload.metadata?.videoId as string
      if (!videoId) {
        throw {
          status_code: 400,
          body: 'Missing required metadata: videoId'
        }
      }

      // SECURITY: Verify video record exists and is in UPLOADING state
      const video = await prisma.video.findUnique({
        where: { id: videoId }
      })

      if (!video) {
        throw {
          status_code: 404,
          body: 'Video record not found'
        }
      }

      if (video.status !== 'UPLOADING') {
        throw {
          status_code: 400,
          body: 'Video is not in UPLOADING state'
        }
      }

      return { metadata: upload.metadata }
    } catch (error) {
      console.error('[UPLOAD] Error in onUploadCreate:', error)
      throw error
    }
  },

  // When upload completes, process the video
  async onUploadFinish(req, upload) {
    const tusFilePath = path.join(TUS_UPLOAD_DIR, upload.id)

    try {
      // Extract video ID from metadata
      const videoId = upload.metadata?.videoId as string
      if (!videoId) {
        console.error('[UPLOAD] No videoId in upload metadata')
        return {}
      }

      // Get video record
      const video = await prisma.video.findUnique({
        where: { id: videoId }
      })

      if (!video) {
        console.error(`[UPLOAD] Video not found: ${videoId}`)
        return {}
      }

      // SECURITY: Verify the uploaded file exists
      if (!fs.existsSync(tusFilePath)) {
        console.error(`[UPLOAD] File not found: ${tusFilePath}`)
        throw new Error('Uploaded file not found on disk')
      }

      // SECURITY: Verify file size matches expected size
      const fileStats = fs.statSync(tusFilePath)
      const fileSize = fileStats.size

      if (upload.size && fileSize !== upload.size) {
        console.error(
          `[UPLOAD] File size mismatch for ${videoId}: ` +
          `expected ${upload.size} bytes, got ${fileSize} bytes`
        )
        throw new Error(
          `File size mismatch: expected ${upload.size} bytes, got ${fileSize} bytes. ` +
          `Upload may have been interrupted.`
        )
      }

      // VALIDATION: Check file extension
      const filename = upload.metadata?.filename as string
      if (filename) {
        const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))
        const allowedExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv']

        if (!allowedExtensions.includes(ext)) {
          console.error(`[UPLOAD] Invalid file extension: ${ext}`)

          // Clean up the invalid file immediately
          try {
            fs.unlinkSync(tusFilePath)
            const metadataPath = `${tusFilePath}.json`
            if (fs.existsSync(metadataPath)) {
              fs.unlinkSync(metadataPath)
            }
          } catch (cleanupErr) {
            console.error('[UPLOAD] Failed to cleanup invalid file:', cleanupErr)
          }

          throw new Error(
            `Invalid file extension: ${ext}. Allowed video formats: ${allowedExtensions.join(', ')}`
          )
        }
      }

      // SECURITY: Validate file magic bytes (file signature)
      // This prevents malware disguised with video extensions
      try {
        const { fileTypeFromFile } = await import('file-type')
        const fileType = await fileTypeFromFile(tusFilePath)

        const allowedMimeTypes = [
          'video/mp4',
          'video/quicktime',      // .mov
          'video/x-msvideo',      // .avi
          'video/webm',
          'video/x-matroska'      // .mkv
        ]

        if (!fileType || !allowedMimeTypes.includes(fileType.mime)) {
          console.error(`[UPLOAD] Invalid file type. Detected: ${fileType?.mime || 'unknown'}`)

          // Clean up the invalid file immediately
          try {
            fs.unlinkSync(tusFilePath)
            const metadataPath = `${tusFilePath}.json`
            if (fs.existsSync(metadataPath)) {
              fs.unlinkSync(metadataPath)
            }
          } catch (cleanupErr) {
            console.error('[UPLOAD] Failed to cleanup invalid file:', cleanupErr)
          }

          throw new Error(
            `Invalid video file. File appears to be ${fileType?.mime || 'unknown'}, not a valid video format.`
          )
        }

        console.log(`[UPLOAD] File type validation passed: ${fileType.mime}`)
      } catch (error) {
        // If file-type library fails to load, log warning but don't fail the upload
        // This ensures backwards compatibility if the library has issues
        if (error instanceof Error && error.message.includes('Invalid video file')) {
          // Re-throw validation errors
          throw error
        }
        console.warn('[UPLOAD] File type validation skipped:', error)
      }

      // Import storage functions
      const { uploadFile, initStorage } = await import('@/lib/storage')

      // Initialize storage
      await initStorage()

      // CRITICAL: Use tusServer.datastore.read() instead of fs.createReadStream()
      // The FileStore stores files with metadata, and .read() properly extracts just the file content
      // Using fs.createReadStream() directly would read the raw storage format, causing file corruption
      const fileStream = (tusServer.datastore as any).read(upload.id)

      // Upload to permanent storage with proper stream handling
      // The uploadFile function uses pipeline() which:
      // - Waits for both read and write streams to complete
      // - Properly handles errors from both streams
      // - Verifies file size after upload
      await uploadFile(
        video.originalStoragePath,
        fileStream,
        fileSize,
        upload.metadata?.filetype as string || 'video/mp4'
      )

      // Queue video processing
      await videoQueue.add('process-video', {
        videoId: video.id,
        originalStoragePath: video.originalStoragePath,
        projectId: video.projectId,
      })

      // Clean up TUS file ONLY after successful upload and verification
      try {
        fs.unlinkSync(tusFilePath)
        // Also try to clean up the metadata file
        const metadataPath = `${tusFilePath}.json`
        if (fs.existsSync(metadataPath)) {
          fs.unlinkSync(metadataPath)
        }
      } catch (cleanupError) {
        console.error('[UPLOAD] Failed to cleanup TUS files:', cleanupError)
        // Don't throw - cleanup failure is not critical
      }

      return {}
    } catch (error) {
      console.error('[UPLOAD] Error in onUploadFinish:', error)

      // Clean up TUS file on error
      try {
        if (fs.existsSync(tusFilePath)) {
          fs.unlinkSync(tusFilePath)
        }
      } catch (cleanupError) {
        console.error('[UPLOAD] Failed to cleanup TUS file after error:', cleanupError)
      }

      // Mark video as ERROR if processing fails
      const videoId = upload.metadata?.videoId as string
      if (videoId) {
        try {
          await prisma.video.update({
            where: { id: videoId },
            data: {
              status: 'ERROR',
              processingError: error instanceof Error ? error.message : 'Unknown upload error'
            }
          })
        } catch (dbError) {
          console.error('[UPLOAD] Failed to mark video as ERROR:', dbError)
        }
      }

      throw error
    }
  }
})

// CRITICAL: Pages Router configuration to disable body parsing
// This is the ONLY way in Next.js to handle large file uploads without corruption
export const config = {
  api: {
    bodyParser: false, // Disable body parsing - TUS handles raw streams
    sizeLimit: '1000mb', // Allow large request bodies (up to 1GB)
    responseLimit: false, // No response size limit
  },
  maxDuration: 3600, // 1 hour timeout for large uploads
}

// Convert NextApiRequest to Web Request for TUS server
function toWebRequest(req: NextApiRequest): Request {
  const protocol = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const url = `${protocol}://${host}${req.url}`

  // Convert headers
  const headers = new Headers()
  Object.entries(req.headers).forEach(([key, value]) => {
    if (value) {
      headers.set(key, Array.isArray(value) ? value[0] : value)
    }
  })

  // Convert Node.js stream to Web ReadableStream for proper binary handling
  // CRITICAL: Passing IncomingMessage directly causes data corruption with large binary uploads
  // Use Readable.toWeb() to properly convert Node.js stream to Web stream
  let body: ReadableStream | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // @ts-ignore - Node.js 16.5+ provides Readable.toWeb()
    body = Readable.toWeb(req)
  }

  return new Request(url, {
    method: req.method || 'GET',
    headers,
    body,
    // @ts-ignore - duplex is required for streaming requests
    duplex: 'half',
  })
}

// Convert Web Response to NextApiResponse
async function fromWebResponse(webRes: Response, res: NextApiResponse): Promise<void> {
  // Set status
  res.status(webRes.status)

  // Set headers
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  // Set body
  if (webRes.body) {
    const reader = webRes.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
    } finally {
      reader.releaseLock()
    }
  }

  res.end()
}

// Main handler - delegates to TUS server
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Convert Next.js API request to Web Request
    const webRequest = toWebRequest(req)

    // Handle with TUS server
    const webResponse = await tusServer.handleWeb(webRequest)

    // Convert Web Response back to Next.js API response
    await fromWebResponse(webResponse, res)
  } catch (error) {
    console.error('[UPLOAD] Pages Router Error:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
