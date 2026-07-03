import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { prisma } from './db'
import { getClientIpAddress } from './utils'
import { getClientSessionTimeoutSeconds } from './settings'
import { getRedis } from './redis'
import { getSecuritySettings } from './video-access'
import { logError, logMessage } from './logging'

export interface AlbumAccessToken {
  albumId: string
  projectId: string
  sessionId: string
  ipAddress: string
  createdAt: number
  isAdmin: boolean
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
  sessionId: string
): Promise<string> {
  const redis = getRedis()

  const cacheKey = `album_token_cache:${sessionId}:${albumId}`
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
  }

  const ttlSeconds = await getClientSessionTimeoutSeconds()

  await redis.setex(`album_access:${token}`, ttlSeconds, JSON.stringify(tokenData))
  await redis.setex(cacheKey, ttlSeconds, token)

  return token
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
