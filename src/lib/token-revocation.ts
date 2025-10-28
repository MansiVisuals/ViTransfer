/**
 * Token Revocation Service
 * 
 * Implements a JWT token revocation/blacklist mechanism using Redis.
 * This ensures that even if a JWT hasn't expired, it can be invalidated on logout.
 * 
 * Security considerations:
 * 1. Uses Redis for distributed token revocation (works across multiple instances)
 * 2. Tokens are stored with TTL matching their expiration time (automatic cleanup)
 * 3. Both access and refresh tokens are revoked on logout
 * 4. Prevents token reuse after logout
 * 5. NO FALLBACKS - fails securely if Redis is unavailable
 */

import IORedis from 'ioredis'

let redis: IORedis | null = null

/**
 * Get or create Redis connection for token revocation
 * Throws error if Redis is not configured
 */
function getRedisConnection(): IORedis {
  if (redis) return redis

  if (!process.env.REDIS_HOST) {
    throw new Error('REDIS_HOST environment variable is required for token revocation')
  }

  redis = new IORedis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  })

  redis.on('error', (error) => {
    console.error('Redis connection error (token revocation):', error)
  })

  redis.on('connect', () => {
    // Redis connected successfully
  })

  return redis
}

/**
 * Export Redis connection for use in auth routes (fingerprinting)
 * This allows the login/refresh endpoints to store and verify fingerprints
 */
export function getRedis(): IORedis {
  return getRedisConnection()
}

/**
 * Revoke a JWT token by adding it to the blacklist
 * 
 * @param token - The JWT token to revoke
 * @param expiresIn - Time in seconds until the token naturally expires
 * 
 * How it works:
 * - Stores the token hash in Redis with a TTL matching token expiration
 * - Once token expires naturally, Redis automatically removes it (no manual cleanup needed)
 * - Uses token signature as key to save space (tokens can be large)
 * 
 * Security: Throws error if Redis is unavailable (fail closed)
 */
export async function revokeToken(token: string, expiresIn: number): Promise<void> {
  const redis = getRedisConnection()
  
  if (redis.status !== 'ready') {
    await redis.connect()
  }

  // Use the token signature (last part) as the key to save space
  // Format: blacklist:token:{signature}
  const tokenParts = token.split('.')
  const signature = tokenParts[tokenParts.length - 1]
  const key = `blacklist:token:${signature}`

  // Store with TTL equal to token expiration time
  // Value is timestamp of revocation for audit purposes
  await redis.setex(key, expiresIn, Date.now().toString())
}

/**
 * Check if a token has been revoked
 * 
 * @param token - The JWT token to check
 * @returns true if token is revoked, false otherwise
 * 
 * Security: Throws error if Redis is unavailable (fail closed)
 * This ensures we never accidentally allow a revoked token
 */
export async function isTokenRevoked(token: string): Promise<boolean> {
  const redis = getRedisConnection()
  
  if (redis.status !== 'ready') {
    await redis.connect()
  }

  const tokenParts = token.split('.')
  const signature = tokenParts[tokenParts.length - 1]
  const key = `blacklist:token:${signature}`

  const result = await redis.exists(key)
  return result === 1
}

/**
 * Revoke all tokens for a specific user
 * Useful for security events (password change, account compromise, etc.)
 *
 * @param userId - The user ID whose tokens should be revoked
 *
 * Note: This requires maintaining a user->tokens mapping, which adds complexity.
 * For this implementation, we rely on short token TTLs (15 min access, 7 day refresh).
 * For immediate revocation, use the logout endpoint which revokes specific tokens.
 *
 * Security: Throws error if Redis is unavailable (fail closed)
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  const redis = getRedisConnection()

  if (redis.status !== 'ready') {
    await redis.connect()
  }

  // Store a flag that user's session is invalidated
  // This can be checked before validating any token
  const key = `blacklist:user:${userId}`
  // Set for 7 days (max refresh token lifetime)
  await redis.setex(key, 7 * 24 * 60 * 60, Date.now().toString())
}

/**
 * Check if all of a user's tokens have been revoked
 *
 * @param userId - The user ID to check
 * @returns true if all user's tokens are revoked, false otherwise
 *
 * Security: Throws error if Redis is unavailable (fail closed)
 */
export async function isUserTokensRevoked(userId: string): Promise<boolean> {
  const redis = getRedisConnection()

  if (redis.status !== 'ready') {
    await redis.connect()
  }

  const key = `blacklist:user:${userId}`
  const result = await redis.exists(key)
  const isRevoked = result === 1

  return isRevoked
}

/**
 * Clear user revocation (e.g., after password reset)
 *
 * @param userId - The user ID to clear revocation for
 *
 * Security: Throws error if Redis is unavailable (fail closed)
 */
export async function clearUserRevocation(userId: string): Promise<void> {
  const redis = getRedisConnection()

  if (redis.status !== 'ready') {
    await redis.connect()
  }

  const key = `blacklist:user:${userId}`
  await redis.del(key)
}

/**
 * Clean up and close Redis connection
 * Should be called on application shutdown
 */
export async function closeRedisConnection(): Promise<void> {
  if (redis) {
    await redis.quit()
    redis = null
  }
}
