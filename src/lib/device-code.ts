/**
 * Device Code Grant (RFC 8628) - Core Logic
 *
 * Enables OAuth-style device authorization flow for workflow integrations
 * (DaVinci Resolve and Premiere Pro). The plugin obtains a device code,
 * opens a browser for authentication, and polls for tokens once the user authorizes.
 *
 * Redis Keys:
 * - device_code:dc:{deviceCode} → JSON metadata (10 min TTL)
 * - device_code:uc:{userCode}   → deviceCode mapping (10 min TTL)
 * - device_code:poll:{deviceCode} → last poll timestamp (10 min TTL)
 */

import crypto from 'crypto'
import { getRedis } from './redis'

const DEVICE_CODE_TTL = 600 // 10 minutes
const MIN_POLL_INTERVAL = 5 // seconds

interface DeviceCodeData {
  deviceCode: string
  userCode: string
  clientId: string
  status: 'pending' | 'authorized' | 'denied' | 'expired' | 'consumed'
  userId?: string
  createdAt: number
  expiresAt: number
}

/**
 * Generate a cryptographically random device code (32-byte base64url)
 * and an 8-character user code in ABCD-1234 format
 */
export function generateDeviceCode(): { deviceCode: string; userCode: string } {
  const deviceCode = crypto.randomBytes(32).toString('base64url')

  // Generate user code: 4 uppercase letters + 4 digits (ABCD-1234)
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // Excluded I and O to avoid confusion
  const digits = '23456789' // Excluded 0 and 1 to avoid confusion

  let userCode = ''
  for (let i = 0; i < 4; i++) {
    userCode += letters.charAt(crypto.randomInt(letters.length))
  }
  userCode += '-'
  for (let i = 0; i < 4; i++) {
    userCode += digits.charAt(crypto.randomInt(digits.length))
  }

  return { deviceCode, userCode }
}

/**
 * Store a new device code in Redis with 10-minute TTL
 */
export async function storeDeviceCode(
  deviceCode: string,
  userCode: string,
  clientId: string
): Promise<void> {
  const redis = getRedis()
  const now = Date.now()

  const data: DeviceCodeData = {
    deviceCode,
    userCode,
    clientId,
    status: 'pending',
    createdAt: now,
    expiresAt: now + DEVICE_CODE_TTL * 1000,
  }

  // Store device code metadata
  await redis.setex(
    `device_code:dc:${deviceCode}`,
    DEVICE_CODE_TTL,
    JSON.stringify(data)
  )

  // Store user code → device code mapping
  await redis.setex(
    `device_code:uc:${userCode}`,
    DEVICE_CODE_TTL,
    deviceCode
  )
}

/**
 * Get the current status of a device code
 */
export async function getDeviceCodeStatus(
  deviceCode: string
): Promise<DeviceCodeData | null> {
  const redis = getRedis()
  const raw = await redis.get(`device_code:dc:${deviceCode}`)
  if (!raw) return null

  try {
    const data = JSON.parse(raw) as DeviceCodeData
    // Check if expired
    if (Date.now() > data.expiresAt) {
      data.status = 'expired'
    }
    return data
  } catch {
    return null
  }
}

/**
 * Authorize a device code by user code, binding it to a user
 */
export async function authorizeDeviceCode(
  userCode: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const redis = getRedis()

  // Look up device code from user code
  const deviceCode = await redis.get(`device_code:uc:${userCode}`)
  if (!deviceCode) {
    return { success: false, error: 'Invalid or expired user code' }
  }

  // Get device code data
  const raw = await redis.get(`device_code:dc:${deviceCode}`)
  if (!raw) {
    return { success: false, error: 'Device code expired' }
  }

  const data = JSON.parse(raw) as DeviceCodeData

  if (data.status !== 'pending') {
    return { success: false, error: `Device code already ${data.status}` }
  }

  if (Date.now() > data.expiresAt) {
    return { success: false, error: 'Device code expired' }
  }

  // Mark as authorized with user ID
  data.status = 'authorized'
  data.userId = userId

  // Update with remaining TTL
  const remainingTtl = Math.ceil((data.expiresAt - Date.now()) / 1000)
  if (remainingTtl <= 0) {
    return { success: false, error: 'Device code expired' }
  }

  await redis.setex(
    `device_code:dc:${deviceCode}`,
    remainingTtl,
    JSON.stringify(data)
  )

  // Delete user code mapping (one-time use)
  await redis.del(`device_code:uc:${userCode}`)

  return { success: true }
}

/**
 * Consume a device code (one-time use), returns userId if authorized
 */
export async function consumeDeviceCode(
  deviceCode: string
): Promise<{ userId: string } | null> {
  const redis = getRedis()
  const raw = await redis.get(`device_code:dc:${deviceCode}`)
  if (!raw) return null

  const data = JSON.parse(raw) as DeviceCodeData

  if (data.status !== 'authorized' || !data.userId) {
    return null
  }

  // Mark as consumed and delete
  await redis.del(`device_code:dc:${deviceCode}`)
  await redis.del(`device_code:poll:${deviceCode}`)

  return { userId: data.userId }
}

/**
 * Check and enforce minimum poll interval (5 seconds)
 * Returns true if client is polling too fast
 */
export async function checkPollRate(deviceCode: string): Promise<boolean> {
  const redis = getRedis()
  const key = `device_code:poll:${deviceCode}`

  const lastPoll = await redis.get(key)
  const now = Date.now()

  if (lastPoll) {
    const elapsed = (now - parseInt(lastPoll, 10)) / 1000
    if (elapsed < MIN_POLL_INTERVAL) {
      return true // Too fast
    }
  }

  // Record this poll timestamp
  await redis.setex(key, DEVICE_CODE_TTL, now.toString())
  return false // OK
}
