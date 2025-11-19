import { Server } from '@tus/server'
import { FileStore } from '@tus/file-store'
import { prisma } from '@/lib/db'
import { videoQueue } from '@/lib/queue'
import { ALL_ALLOWED_EXTENSIONS } from '@/lib/asset-validation'
import path from 'path'
import fs from 'fs'
import { Readable } from 'stream'
import type { NextApiRequest, NextApiResponse } from 'next'

const TUS_UPLOAD_DIR = '/tmp/vitransfer-tus-uploads'

if (!fs.existsSync(TUS_UPLOAD_DIR)) {
  fs.mkdirSync(TUS_UPLOAD_DIR, { recursive: true })
}

const tusServer: Server = new Server({
  path: '/api/uploads',
  datastore: new FileStore({
    directory: TUS_UPLOAD_DIR,
  }),

  maxSize: Infinity,
  respectForwardedHeaders: true,
  relativeLocation: true,

  async onUploadCreate(req, upload) {
    try {
      const cookieHeader = req.headers.get('cookie')
      const sessionCookie = cookieHeader?.split(';').find(c => c.trim().startsWith('vitransfer_session='))?.split('=')[1]

      if (!sessionCookie) {
        throw {
          status_code: 401,
          body: 'Authentication required'
        }
      }

      const { verifyAccessToken } = await import('@/lib/auth')
      const payload = await verifyAccessToken(sessionCookie)

      if (!payload || payload.role !== 'ADMIN') {
        throw {
          status_code: 403,
          body: 'Admin access required'
        }
      }

      const videoId = upload.metadata?.videoId as string
      const assetId = upload.metadata?.assetId as string

      if (!videoId && !assetId) {
        throw {
          status_code: 400,
          body: 'Missing required metadata: videoId or assetId'
        }
      }

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

  async onUploadFinish(req, upload) {
    const tusFilePath = path.join(TUS_UPLOAD_DIR, upload.id)
    const videoId = upload.metadata?.videoId as string
    const assetId = upload.metadata?.assetId as string

    try {
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

      if (videoId) {
        await markVideoAsError(videoId, error)
      }

      throw error
    }
  }
})

async function handleVideoUploadFinish(tusFilePath: string, upload: any, videoId: string, tusServer: any) {
  const video = await prisma.video.findUnique({
    where: { id: videoId }
  })

  if (!video) {
    console.error(`[UPLOAD] Video not found: ${videoId}`)
    return {}
  }

  const fileSize = await verifyUploadedFile(tusFilePath, upload.size)

  await validateVideoFile(tusFilePath, upload.metadata?.filename as string)

  const { uploadFile, initStorage } = await import('@/lib/storage')
  await initStorage()

  const fileStream = (tusServer.datastore as any).read(upload.id)

  await uploadFile(
    video.originalStoragePath,
    fileStream,
    fileSize,
    upload.metadata?.filetype as string || 'video/mp4'
  )

  await videoQueue.add('process-video', {
    videoId: video.id,
    originalStoragePath: video.originalStoragePath,
    projectId: video.projectId,
  })

  await cleanupTUSFile(tusFilePath)

  return {}
}

async function handleAssetUploadFinish(tusFilePath: string, upload: any, assetId: string, tusServer: any) {
  const asset = await prisma.videoAsset.findUnique({
    where: { id: assetId }
  })

  if (!asset) {
    console.error(`[UPLOAD] Asset not found: ${assetId}`)
    return {}
  }

  const fileSize = await verifyUploadedFile(tusFilePath, upload.size)

  await validateAssetFile(tusFilePath, upload.metadata?.filename as string)

  const { uploadFile, initStorage } = await import('@/lib/storage')
  await initStorage()

  const fileStream = (tusServer.datastore as any).read(upload.id)

  const actualFileType = upload.metadata?.filetype as string || 'application/octet-stream'
  await uploadFile(
    asset.storagePath,
    fileStream,
    fileSize,
    actualFileType
  )

  await prisma.videoAsset.update({
    where: { id: assetId },
    data: {
      fileType: actualFileType,
    },
  })

  await cleanupTUSFile(tusFilePath)

  return {}
}

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

async function validateVideoFile(tusFilePath: string, filename?: string) {
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

  try {
    const { fileTypeFromFile } = await import('file-type')
    const fileType = await fileTypeFromFile(tusFilePath)

    const allowedMimeTypes = [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm',
      'video/x-matroska'
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

async function validateAssetFile(tusFilePath: string, filename?: string) {
  if (filename) {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))
    if (!ALL_ALLOWED_EXTENSIONS.includes(ext)) {
      await cleanupTUSFile(tusFilePath)
      throw new Error(
        `Invalid file extension: ${ext}. Allowed: ${ALL_ALLOWED_EXTENSIONS.join(', ')}`
      )
    }
  }

  try {
    const { fileTypeFromFile } = await import('file-type')
    const fileType = await fileTypeFromFile(tusFilePath)

    const allowedMimeTypes = [
      'image/jpeg', 'image/png', 'image/tiff',
      'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/flac', 'audio/x-m4a',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip', 'application/gzip', 'application/x-gzip',
      'application/octet-stream'
    ]

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

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '1000mb',
    responseLimit: false,
  },
  maxDuration: 3600,
}

function toWebRequest(req: NextApiRequest): Request {
  const protocol = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const url = `${protocol}://${host}${req.url}`

  const headers = new Headers()
  Object.entries(req.headers).forEach(([key, value]) => {
    if (value) {
      headers.set(key, Array.isArray(value) ? value[0] : value)
    }
  })

  let body: ReadableStream | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // @ts-ignore
    body = Readable.toWeb(req)
  }

  return new Request(url, {
    method: req.method || 'GET',
    headers,
    body,
    // @ts-ignore
    duplex: 'half',
  })
}

async function fromWebResponse(webRes: Response, res: NextApiResponse): Promise<void> {
  res.status(webRes.status)

  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const webRequest = toWebRequest(req)
    const webResponse = await tusServer.handleWeb(webRequest)
    await fromWebResponse(webResponse, res)
  } catch (error) {
    console.error('[UPLOAD] Pages Router Error:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
