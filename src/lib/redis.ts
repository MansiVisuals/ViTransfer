import IORedis from 'ioredis'
import { logError, logMessage } from './logging'

let redis: IORedis | null = null
let redisForQueue: IORedis | null = null

const REDIS_DB = Math.max(0, parseInt(process.env.REDIS_DB || '0', 10) || 0)

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
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: REDIS_DB,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times) => {
      if (times > 3) {
        logError('Redis connection failed after 3 retries')
        return null
      }
      return Math.min(times * 100, 3000)
    }
  })

  redis.on('error', (error) => {
    logError('Redis error:', error.message)
  })

  redis.on('connect', () => {
    logMessage('Redis connected successfully')
  })

  return redis
}

/**
 * Get or create Redis connection optimized for BullMQ
 * BullMQ requires specific configuration: maxRetriesPerRequest: null, enableReadyCheck: false
 */
export function getRedisForQueue(): IORedis {
  if (redisForQueue) return redisForQueue

  if (!process.env.REDIS_HOST) {
    throw new Error('REDIS_HOST environment variable is required')
  }

  redisForQueue = new IORedis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: REDIS_DB,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,     // Required by BullMQ
    lazyConnect: true,
    retryStrategy: (times) => {
      // Only retry in production/runtime, not during build
      if (process.env.NEXT_PHASE === 'phase-production-build') {
        return null // Don't retry during build
      }
      const delay = Math.min(times * 50, 2000)
      return delay
    }
  })

  redisForQueue.on('error', (error) => {
    logError('Redis (Queue) error:', error.message)
  })

  redisForQueue.on('connect', () => {
    logMessage('Redis (Queue) connected successfully')
  })

  return redisForQueue
}

/**
 * Alias for backwards compatibility
 * Some modules use getRedisConnection() instead of getRedis()
 */
const getRedisConnection = getRedis

/**
 * Atomically claim one use of a Redis token via Lua script.
 * Returns true if the token was present, matched, and had a use left.
 *
 * `maxUses` defaults to 1, which is a strict single-use consume — keep that for
 * anything that authenticates (magic links). Download tokens allow a few uses
 * so a transfer that dies part-way can be retried: they are already bound to
 * the requester IP + User-Agent and expire on their own, and single-use only
 * ever blocked the legitimate retry.
 *
 * The use counter lives in a sibling key that inherits the token's remaining
 * TTL, so the token payload stays byte-identical for the value comparison.
 */
export async function consumeTokenAtomically(
  redis: IORedis,
  tokenKey: string,
  expectedValue: string,
  maxUses: number = 1
): Promise<boolean> {
  const result = await redis.eval(
    `
      local current = redis.call('GET', KEYS[1])
      if not current then
        return 0
      end
      if current ~= ARGV[1] then
        return -1
      end
      local uses = redis.call('INCR', KEYS[2])
      if uses == 1 then
        local ttl = redis.call('TTL', KEYS[1])
        if ttl > 0 then
          redis.call('EXPIRE', KEYS[2], ttl)
        end
      end
      if uses >= tonumber(ARGV[2]) then
        redis.call('DEL', KEYS[1])
        redis.call('DEL', KEYS[2])
      end
      return 1
    `,
    2,
    tokenKey,
    `${tokenKey}:uses`,
    expectedValue,
    String(Math.max(1, Math.floor(maxUses)))
  )

  return Number(result) === 1
}

/**
 * Close Redis connection gracefully
 * Should be called on application shutdown
 */
export async function closeRedisConnection(): Promise<void> {
  if (redis) {
    await redis.quit()
    redis = null
  }
  if (redisForQueue) {
    await redisForQueue.quit()
    redisForQueue = null
  }
}
