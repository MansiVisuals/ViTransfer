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

import { getRedis } from './redis'

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
  const redis = getRedis()
  
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
  const redis = getRedis()
  
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
  const redis = getRedis()

  if (redis.status !== 'ready') {
    await redis.connect()
  }

  // Store a flag that user's session is invalidated
  // This can be checked before validating any token
  const key = `blacklist:user:${userId}`
  // Set for 3 days (max refresh token lifetime)
  await redis.setex(key, 3 * 24 * 60 * 60, Date.now().toString())
}

/**
 * Check if all of a user's tokens have been revoked
 *
 * @param userId - The user ID to check
 * @param tokenIssuedAt - Optional timestamp when token was issued (JWT 'iat' field)
 * @returns true if all user's tokens are revoked, false otherwise
 *
 * If tokenIssuedAt is provided, only returns true if token was issued BEFORE revocation time.
 * This allows new tokens issued after revocation to work (e.g., after password change).
 *
 * Security: Throws error if Redis is unavailable (fail closed)
 */
export async function isUserTokensRevoked(userId: string, tokenIssuedAt?: number): Promise<boolean> {
  const redis = getRedis()

  if (redis.status !== 'ready') {
    await redis.connect()
  }

  const key = `blacklist:user:${userId}`
  const revocationTimestamp = await redis.get(key)

  if (!revocationTimestamp) {
    // No revocation flag set
    return false
  }

  // If no token issued time provided, revoke all tokens
  if (!tokenIssuedAt) {
    return true
  }

  // Compare: token was issued BEFORE revocation = revoked
  // token was issued AFTER revocation = allowed (new session)
  const revocationTime = parseInt(revocationTimestamp, 10) / 1000 // Convert ms to seconds for JWT comparison
  return tokenIssuedAt < revocationTime
}

/**
 * Clear user revocation (e.g., after password reset)
 *
 * @param userId - The user ID to clear revocation for
 *
 * Security: Throws error if Redis is unavailable (fail closed)
 */
export async function clearUserRevocation(userId: string): Promise<void> {
  const redis = getRedis()

  if (redis.status !== 'ready') {
    await redis.connect()
  }

  const key = `blacklist:user:${userId}`
  await redis.del(key)
}
