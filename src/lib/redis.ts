/**
 * Centralized Redis Connection
 *
 * Single source of truth for all Redis connections across the application.
 * Used by: video-access, rate-limit, session-invalidation, token-revocation, OTP, etc.
 *
 * Features:
 * - Singleton pattern (reuses same connection)
 * - Lazy connection (connects on first use)
 * - Automatic retry with backoff
 * - Proper error handling
 * - Production-ready configuration
 */

import IORedis from 'ioredis'

let redis: IORedis | null = null

/**
 * Get or create Redis connection
 * Throws error if Redis is not configured
 */
export function getRedis(): IORedis {
  if (redis) return redis

  if (!process.env.REDIS_HOST) {
    throw new Error('REDIS_HOST environment variable is required')
  }

  redis = new IORedis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 3) {
        console.error('Redis connection failed after 3 retries')
        return null
      }
      return Math.min(times * 100, 3000)
    }
  })

  redis.on('error', (error) => {
    console.error('Redis error:', error.message)
  })

  redis.on('connect', () => {
    console.log('Redis connected successfully')
  })

  return redis
}

/**
 * Alias for backwards compatibility
 * Some modules use getRedisConnection() instead of getRedis()
 */
export const getRedisConnection = getRedis

/**
 * Close Redis connection gracefully
 * Should be called on application shutdown
 */
export async function closeRedisConnection(): Promise<void> {
  if (redis) {
    await redis.quit()
    redis = null
  }
}
