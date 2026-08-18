import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { prisma } from './db'
import { getClientIpAddress } from './utils'
import { getClientSessionTimeoutSeconds } from './settings'
import { getRedis } from './redis'
import { getSecuritySettings } from './video-access'
import { isS3Mode } from './storage'
import { s3GetPresignedStreamUrl } from './s3-storage'
import { logError, logMessage } from './logging'

/** SigV4 caps presigned URL lifetime at 7 days. */
const MAX_PRESIGN_SECONDS = 604800

export interface AlbumAccessToken {
  albumId: string
  projectId: string
  sessionId: string
  ipAddress: string
  createdAt: number
  isAdmin: boolean
  isGuest?: boolean
}

/**
 * Generate a time-limited album access token with session binding.
 * One token covers all photos in an album; cached per session to
 * prevent token proliferation (mirrors generateVideoAccessToken).
 */
export async function generateAlbumAccessToken(
  albumId: string,
  projectId: string,
  request: NextRequest,
  sessionId: string,
  isGuest = false
): Promise<string> {
  const redis = getRedis()

  const cacheKey = `album_token_cache:${sessionId}:${isGuest ? 'guest' : 'full'}:${albumId}`
  const cachedToken = await redis.get(cacheKey)

  if (cachedToken) {
    const tokenData = await redis.get(`album_access:${cachedToken}`)
    if (tokenData) {
      return cachedToken
    }
  }

  const token = crypto.randomBytes(16).toString('base64url')
  const ipAddress = getClientIpAddress(request)

  const tokenData: AlbumAccessToken = {
    albumId,
    projectId,
    sessionId,
    ipAddress,
    createdAt: Date.now(),
    isAdmin: sessionId.startsWith('admin:'),
    isGuest,
  }

  const ttlSeconds = await getClientSessionTimeoutSeconds()

  await redis.setex(`album_access:${token}`, ttlSeconds, JSON.stringify(tokenData))
  await redis.setex(cacheKey, ttlSeconds, token)

  return token
}

/**
 * Direct URL for a worker-generated rendition (thumb or preview).
 *
 * In S3 mode this presigns the object so the browser fetches it straight from
 * the bucket — painting a 2000-tile grid then costs zero app requests instead
 * of 2000 round trips, each of which would otherwise re-verify the token and
 * re-query the photo row. FS mode keeps the token route because the app owns
 * the disk and there is nothing to hand off to.
 *
 * Renditions are always webp; originals are never linked this way.
 */
export async function buildRenditionUrl(
  renditionPath: string,
  contentToken: string,
  photoId: string,
  variant: 'thumb' | 'full',
  ttlSeconds: number
): Promise<string> {
  if (isS3Mode()) {
    return s3GetPresignedStreamUrl(renditionPath, Math.min(ttlSeconds, MAX_PRESIGN_SECONDS), 'image/webp')
  }
  return `/api/content/photo/${contentToken}?photoId=${photoId}&variant=${variant}`
}

/**
 * Record a photo download event (mirrors trackVideoAccess: respects the
 * analytics toggle and skips admin activity).
 */
export async function trackPhotoDownload(params: {
  projectId: string
  albumId?: string // undefined for whole-project zips
  photoIds: string[]
  isAdmin?: boolean
}) {
  const { projectId, albumId, photoIds, isAdmin } = params

  const settings = await getSecuritySettings()
  if (!settings.trackAnalytics) {
    return
  }

  // Avoid inflating metrics with admin activity
  if (isAdmin) {
    return
  }

  await prisma.videoAnalytics.create({
    data: {
      projectId,
      eventType: 'DOWNLOAD_COMPLETE',
      albumId,
      photoIds: JSON.stringify(photoIds),
    },
  })
}

/**
 * Verify album access token and validate session binding.
 */
export async function verifyAlbumAccessToken(token: string): Promise<AlbumAccessToken | null> {
  const redis = getRedis()
  const data = await redis.get(`album_access:${token}`)

  if (!data) {
    return null
  }

  try {
    const tokenData: AlbumAccessToken = JSON.parse(data)

    if (!tokenData.albumId || !tokenData.projectId || !tokenData.sessionId) {
      logMessage(`[SECURITY] Invalid album token data structure (tokenPrefix=${token.substring(0, 10)})`)
      return null
    }

    return tokenData
  } catch (error) {
    logError(`[SECURITY] Failed to parse album access token data (tokenPrefix=${token.substring(0, 10)})`, error)
    return null
  }
}
