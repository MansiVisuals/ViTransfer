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
const tusServer: Server = new Server({
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

      // Determine upload type: video or asset
      const videoId = upload.metadata?.videoId as string
      const assetId = upload.metadata?.assetId as string

      // Must have either videoId (for video) or assetId (for asset)
      if (!videoId && !assetId) {
        throw {
          status_code: 400,
          body: 'Missing required metadata: videoId or assetId'
        }
      }

      // VIDEO UPLOAD: Verify video record exists and is in UPLOADING state
      if (videoId) {
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
      }

      // ASSET UPLOAD: Verify asset record exists
      if (assetId) {
        const asset = await prisma.videoAsset.findUnique({
          where: { id: assetId }
        })

        if (!asset) {
          throw {
            status_code: 404,
            body: 'Asset record not found'
          }
        }
      }

      return { metadata: upload.metadata }
    } catch (error) {
      console.error('[UPLOAD] Error in onUploadCreate:', error)
      throw error
    }
  },

  // When upload completes, process the video or asset
  async onUploadFinish(req, upload) {
    const tusFilePath = path.join(TUS_UPLOAD_DIR, upload.id)
    const videoId = upload.metadata?.videoId as string
    const assetId = upload.metadata?.assetId as string

    try {
      // Route to appropriate handler
      if (videoId) {
        return await handleVideoUploadFinish(tusFilePath, upload, videoId, tusServer)
      } else if (assetId) {
        return await handleAssetUploadFinish(tusFilePath, upload, assetId, tusServer)
      } else {
        console.error('[UPLOAD] No videoId or assetId in upload metadata')
        return {}
      }
    } catch (error) {
      console.error('[UPLOAD] Error in onUploadFinish:', error)
      await cleanupTUSFile(tusFilePath)

      // Mark video/asset as ERROR
      if (videoId) {
        await markVideoAsError(videoId, error)
      }

      throw error
    }
  }
})

// Helper: Handle video upload completion
async function handleVideoUploadFinish(tusFilePath: string, upload: any, videoId: string, tusServer: any) {
  // Get video record
  const video = await prisma.video.findUnique({
    where: { id: videoId }
  })

  if (!video) {
    console.error(`[UPLOAD] Video not found: ${videoId}`)
    return {}
  }

  // Verify file exists and size matches
  const fileSize = await verifyUploadedFile(tusFilePath, upload.size)

  // Validate video file type
  await validateVideoFile(tusFilePath, upload.metadata?.filename as string)

  // Import storage functions
  const { uploadFile, initStorage } = await import('@/lib/storage')
  await initStorage()

  // Use TUS datastore to read file (proper way to extract content)
  const fileStream = (tusServer.datastore as any).read(upload.id)

  // Upload to permanent storage
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

  // Clean up TUS file
  await cleanupTUSFile(tusFilePath)

  return {}
}

// Helper: Handle asset upload completion
async function handleAssetUploadFinish(tusFilePath: string, upload: any, assetId: string, tusServer: any) {
  // Get asset record
  const asset = await prisma.videoAsset.findUnique({
    where: { id: assetId }
  })

  if (!asset) {
    console.error(`[UPLOAD] Asset not found: ${assetId}`)
    return {}
  }

  // Verify file exists and size matches
  const fileSize = await verifyUploadedFile(tusFilePath, upload.size)

  // Validate asset file type
  await validateAssetFile(tusFilePath, upload.metadata?.filename as string)

  // Import storage functions
  const { uploadFile, initStorage } = await import('@/lib/storage')
  await initStorage()

  // Use TUS datastore to read file
  const fileStream = (tusServer.datastore as any).read(upload.id)

  // Upload to permanent storage
  await uploadFile(
    asset.storagePath,
    fileStream,
    fileSize,
    upload.metadata?.filetype as string || 'application/octet-stream'
  )

  // Clean up TUS file
  await cleanupTUSFile(tusFilePath)

  return {}
}

// Helper: Verify uploaded file exists and size matches
async function verifyUploadedFile(tusFilePath: string, expectedSize?: number): Promise<number> {
  if (!fs.existsSync(tusFilePath)) {
    throw new Error('Uploaded file not found on disk')
  }

  const fileStats = fs.statSync(tusFilePath)
  const fileSize = fileStats.size

  if (expectedSize && fileSize !== expectedSize) {
    await cleanupTUSFile(tusFilePath)
    throw new Error(
      `File size mismatch: expected ${expectedSize} bytes, got ${fileSize} bytes. ` +
      `Upload may have been interrupted.`
    )
  }

  return fileSize
}

// Helper: Validate video file type
async function validateVideoFile(tusFilePath: string, filename?: string) {
  // Check file extension
  if (filename) {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))
    const allowedExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv']

    if (!allowedExtensions.includes(ext)) {
      await cleanupTUSFile(tusFilePath)
      throw new Error(
        `Invalid file extension: ${ext}. Allowed video formats: ${allowedExtensions.join(', ')}`
      )
    }
  }

  // Validate file magic bytes
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
      await cleanupTUSFile(tusFilePath)
      throw new Error(
        `Invalid video file. File appears to be ${fileType?.mime || 'unknown'}, not a valid video format.`
      )
    }

    console.log(`[UPLOAD] File type validation passed: ${fileType.mime}`)
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid video file')) {
      throw error
    }
    console.warn('[UPLOAD] File type validation skipped:', error)
  }
}

// Helper: Validate asset file type
async function validateAssetFile(tusFilePath: string, filename?: string) {
  // Check file extension against strict whitelist (matches frontend validation)
  if (filename) {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))
    const allowedExtensions = [
      // Images
      '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.psd', '.ai', '.eps',
      // Audio
      '.wav', '.mp3', '.aac', '.flac', '.m4a',
      // Project files
      '.prproj', '.drp', '.fcpbundle', '.fcpxml',
      // Documents
      '.pdf', '.txt', '.md',
      // Archives
      '.zip'
    ]

    if (!allowedExtensions.includes(ext)) {
      await cleanupTUSFile(tusFilePath)
      throw new Error(
        `Invalid file extension: ${ext}. Allowed: ${allowedExtensions.join(', ')}`
      )
    }
  }

  // Validate file magic bytes for common types
  try {
    const { fileTypeFromFile } = await import('file-type')
    const fileType = await fileTypeFromFile(tusFilePath)

    // Allowed MIME types for assets (strict whitelist)
    const allowedMimeTypes = [
      // Images
      'image/jpeg', 'image/png', 'image/tiff',
      // Audio
      'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/flac', 'audio/x-m4a',
      // Documents
      'application/pdf',
      // Archives
      'application/zip',
      // Generic (for proprietary project files that don't have magic bytes)
      'application/octet-stream'
    ]

    // Some project files don't have detectable magic bytes, so we allow null if extension is valid
    if (fileType && !allowedMimeTypes.includes(fileType.mime)) {
      await cleanupTUSFile(tusFilePath)
      throw new Error(
        `Invalid asset file. File appears to be ${fileType.mime}, which is not allowed.`
      )
    }

    if (fileType) {
      console.log(`[UPLOAD] Asset file type validation passed: ${fileType.mime}`)
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid asset file')) {
      throw error
    }
    console.warn('[UPLOAD] Asset file type validation skipped:', error)
  }
}

// Helper: Clean up TUS file and metadata
async function cleanupTUSFile(tusFilePath: string) {
  try {
    if (fs.existsSync(tusFilePath)) {
      fs.unlinkSync(tusFilePath)
    }
    const metadataPath = `${tusFilePath}.json`
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath)
    }
  } catch (cleanupErr) {
    console.error('[UPLOAD] Failed to cleanup TUS files:', cleanupErr)
  }
}

// Helper: Mark video as ERROR
async function markVideoAsError(videoId: string, error: any) {
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

// TUS server configuration (already defined above)
const tusServer_ignore = tusServer // Prevent duplicate declaration error

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
