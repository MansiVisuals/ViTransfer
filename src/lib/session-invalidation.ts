import IORedis from 'ioredis'

/**
 * Session Invalidation Utilities
 *
 * Security-first approach: When security settings change, immediately invalidate
 * affected sessions to enforce new security posture.
 *
 * Session Types:
 * - Client share sessions: auth_project:{sessionId} → projectId
 * - Share auth cookies: share_auth (contains sessionId)
 *
 * Invalidation Triggers:
 * 1. Session timeout changes → Invalidate ALL sessions globally
 * 2. Project password changes → Invalidate all sessions for that project
 * 3. Hotlink protection changes → Invalidate ALL sessions (more restrictive)
 * 4. Password attempt changes → Clear rate limit counters
 */

let redis: IORedis | null = null

/**
 * Get Redis connection (reuse existing connection if available)
 */
function getRedisConnection(): IORedis {
  if (redis) return redis

  redis = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  })

  return redis
}

/**
 * Scan and delete Redis keys matching a pattern with optional filtering
 * @private
 */
async function scanAndDeleteKeys(
  pattern: string,
  filter?: (key: string, value: string | null) => boolean
): Promise<number> {
  const redis = getRedisConnection()
  const stream = redis.scanStream({ match: pattern, count: 100 })
  const keysToDelete: string[] = []

  for await (const keys of stream) {
    if (filter) {
      // Apply filter - check each key's value
      for (const key of keys) {
        const value = await redis.get(key)
        if (filter(key, value)) {
          keysToDelete.push(key)
        }
      }
    } else {
      // No filter - collect all keys
      keysToDelete.push(...keys)
    }
  }

  // Delete all collected keys in pipeline
  if (keysToDelete.length > 0) {
    const pipeline = redis.pipeline()
    keysToDelete.forEach(key => pipeline.del(key))
    await pipeline.exec()
  }

  return keysToDelete.length
}

/**
 * Invalidate all client sessions for a specific project
 *
 * Use when:
 * - Project password changes
 * - Project is deleted
 * - Project security settings change
 *
 * @param projectId - The project ID to invalidate sessions for
 * @returns Number of sessions invalidated
 */
export async function invalidateProjectSessions(projectId: string): Promise<number> {
  try {
    const invalidatedCount = await scanAndDeleteKeys(
      'auth_project:*',
      (_key, value) => value === projectId
    )

    console.log(`[SESSION_INVALIDATION] Invalidated ${invalidatedCount} sessions for project ${projectId}`)
    return invalidatedCount
  } catch (error) {
    console.error('[SESSION_INVALIDATION] Error invalidating project sessions:', error)
    throw error
  }
}

/**
 * Invalidate ALL client sessions globally
 *
 * Use when:
 * - Session timeout duration changes
 * - Hotlink protection becomes more restrictive
 * - Global security policy changes
 *
 * WARNING: This will force all clients to re-authenticate
 *
 * @returns Number of sessions invalidated
 */
export async function invalidateAllSessions(): Promise<number> {
  try {
    const invalidatedCount = await scanAndDeleteKeys('auth_project:*')

    console.log(`[SESSION_INVALIDATION] Invalidated ALL ${invalidatedCount} client sessions globally`)
    return invalidatedCount
  } catch (error) {
    console.error('[SESSION_INVALIDATION] Error invalidating all sessions:', error)
    throw error
  }
}

/**
 * Clear all rate limit counters (password attempts, etc.)
 *
 * Use when:
 * - Password attempt limit changes
 * - Rate limit configuration changes
 * - Admin wants to reset all lockouts
 *
 * @returns Number of rate limit entries cleared
 */
export async function clearAllRateLimits(): Promise<number> {
  try {
    const clearedCount = await scanAndDeleteKeys('ratelimit:*')

    console.log(`[SESSION_INVALIDATION] Cleared ${clearedCount} rate limit counters`)
    return clearedCount
  } catch (error) {
    console.error('[SESSION_INVALIDATION] Error clearing rate limits:', error)
    throw error
  }
}

/**
 * Get session statistics (for monitoring/debugging)
 *
 * @returns Object with session counts
 */
export async function getSessionStats(): Promise<{
  totalSessions: number
  sessionsByProject: Record<string, number>
}> {
  try {
    const redis = getRedisConnection()
    const sessionsByProject: Record<string, number> = {}
    let totalSessions = 0

    const stream = redis.scanStream({
      match: 'auth_project:*',
      count: 100
    })

    for await (const keys of stream) {
      totalSessions += keys.length

      // Count sessions per project
      for (const key of keys) {
        const projectId = await redis.get(key)
        if (projectId) {
          sessionsByProject[projectId] = (sessionsByProject[projectId] || 0) + 1
        }
      }
    }

    return {
      totalSessions,
      sessionsByProject
    }
  } catch (error) {
    console.error('[SESSION_INVALIDATION] Error getting session stats:', error)
    return {
      totalSessions: 0,
      sessionsByProject: {}
    }
  }
}
