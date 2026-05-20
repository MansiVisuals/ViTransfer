import { getRedis } from './redis'
import { logWarn } from './logging'

/** Revoke a JWT token by adding it to the Redis blacklist. Throws if Redis is unavailable (fail closed). */
export async function revokeToken(token: string, expiresIn: number): Promise<void> {
  const redis = getRedis()
  
  // Use token signature (last part) as key to save space
  const tokenParts = token.split('.')
  const signature = tokenParts[tokenParts.length - 1]
  const key = `blacklist:token:${signature}`

  // Value is timestamp of revocation for audit purposes
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    logWarn('[AUTH] Skipping token revocation due to invalid TTL', { expiresIn, key })
    return
  }

  await redis.setex(key, expiresIn, Date.now().toString())
}

/** Check if a token has been revoked. Throws if Redis is unavailable (fail closed). */
export async function isTokenRevoked(token: string): Promise<boolean> {
  const redis = getRedis()

  const tokenParts = token.split('.')
  const signature = tokenParts[tokenParts.length - 1]
  const key = `blacklist:token:${signature}`

  const result = await redis.exists(key)
  return result === 1
}

/**
 * Revoke all tokens for a user. Relies on short token TTLs for non-immediate cases.
 * Throws if Redis is unavailable (fail closed).
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  const redis = getRedis()
  // Store invalidation flag
  const key = `blacklist:user:${userId}`
  // TTL must outlive the longest-lived refresh token, otherwise pre-revocation
  // refresh tokens can resurface after the blacklist key expires.
  const refreshTtlSeconds = (() => {
    const parsed = parseInt(process.env.ADMIN_REFRESH_TTL_SECONDS || '', 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 7 * 24 * 60 * 60
  })()
  await redis.setex(key, refreshTtlSeconds, Date.now().toString())
}

/**
 * Check if all of a user's tokens have been revoked.
 * If tokenIssuedAt is provided, only returns true if token was issued BEFORE revocation time.
 * Throws if Redis is unavailable (fail closed).
 */
export async function isUserTokensRevoked(userId: string, tokenIssuedAt?: number): Promise<boolean> {
  const redis = getRedis()

  const key = `blacklist:user:${userId}`
  const revocationTimestamp = await redis.get(key)

  if (!revocationTimestamp) {
    return false
  }

  if (!tokenIssuedAt) {
    return true
  }

  // Token issued BEFORE revocation = revoked; AFTER = allowed (new session)
  const revocationTime = parseInt(revocationTimestamp, 10) / 1000 // Convert ms to seconds for JWT comparison
  return tokenIssuedAt < revocationTime
}

/** Clear user revocation (e.g., after password reset). Throws if Redis is unavailable (fail closed). */
export async function clearUserRevocation(userId: string): Promise<void> {
  const redis = getRedis()

  const key = `blacklist:user:${userId}`
  await redis.del(key)
}
