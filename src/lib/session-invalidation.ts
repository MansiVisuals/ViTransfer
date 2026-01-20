import { getRedis } from './redis'
import { prisma } from './db'
import { revokeAllUserTokens } from './token-revocation'

/**
 * Session Invalidation Utilities
 *
 * Security-first approach: When security settings change, immediately invalidate
 * affected sessions to enforce new security posture.
 *
 * Session Types:
 * - Admin sessions: JWT tokens (access + refresh) → blacklist:user:{userId}
 * - Client share sessions: auth_project:{sessionId} → projectId
 * - Share tokens are bearer-based; legacy browser-managed sessions removed in v0.6.0
 *
 * Invalidation Triggers:
 * 1. Session timeout changes → Invalidate ALL sessions globally
 * 2. Project password changes → Invalidate all sessions for that project
 * 3. Project auth mode changes → Invalidate all sessions for that project
 * 4. Hotlink protection changes → Invalidate ALL sessions (more restrictive)
 * 5. Password attempt changes → Clear rate limit counters
 * 6. Admin removal → Revoke all admin tokens for deleted user
 * 7. Admin password change → Revoke all admin tokens (handled in auth.ts)
 * 8. Passkey change/deletion → Revoke all admin tokens as security measure
 * 9. Recipient removal/changes → Invalidate recipient's share sessions
 */

/**
 * Scan and delete Redis keys matching a pattern with optional filtering
 * @private
 */
async function scanAndDeleteKeys(
  pattern: string,
  filter?: (key: string, value: string | null) => boolean
): Promise<number> {
  const redis = getRedis()
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
    const redis = getRedis()
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

/**
 * Invalidate all share token sessions for a specific project
 * by revoking their sessionIds in Redis
 *
 * Use when:
 * - Project auth mode changes
 * - Project password changes
 * - Project security settings change
 *
 * @param projectId - The project ID to invalidate sessions for
 * @returns Number of sessions invalidated
 */
export async function invalidateShareTokensByProject(projectId: string): Promise<number> {
  try {
    const redis = getRedis()

    // Get all unique session IDs for this project
    const sessions = await prisma.sharePageAccess.findMany({
      where: { projectId },
      select: { sessionId: true },
      distinct: ['sessionId']
    })

    if (sessions.length === 0) {
      return 0
    }

    // Revoke each session in Redis with TTL
    // Use conservative TTL of 7 days to outlast any possible token
    const ttl = 7 * 24 * 60 * 60 // 7 days in seconds
    const pipeline = redis.pipeline()

    for (const session of sessions) {
      pipeline.setex(`revoked:share_session:${session.sessionId}`, ttl, '1')
    }

    await pipeline.exec()

    console.log(`[SESSION_INVALIDATION] Invalidated ${sessions.length} share sessions for project ${projectId}`)
    return sessions.length
  } catch (error) {
    console.error('[SESSION_INVALIDATION] Error invalidating share sessions:', error)
    throw error
  }
}

/**
 * Check if a share session is revoked
 * @param sessionId - The session ID to check
 * @returns true if session is revoked
 */
export async function isShareSessionRevoked(sessionId: string): Promise<boolean> {
  try {
    const redis = getRedis()
    const exists = await redis.exists(`revoked:share_session:${sessionId}`)
    return exists === 1
  } catch (error) {
    console.error('[SESSION_INVALIDATION] Error checking session revocation:', error)
    return true // Fail closed: deny access if Redis is unavailable
  }
}

/**
 * Invalidate all admin sessions for a specific user
 *
 * Use when:
 * - Admin user is deleted
 * - Admin passkey is deleted (security measure)
 * - Admin account is compromised
 * - Security-sensitive changes to admin account
 *
 * @param userId - The admin user ID to invalidate sessions for
 */
export async function invalidateAdminSessions(userId: string): Promise<void> {
  try {
    await revokeAllUserTokens(userId)
    console.log(`[SESSION_INVALIDATION] Invalidated all admin sessions for user ${userId}`)
  } catch (error) {
    console.error('[SESSION_INVALIDATION] Error invalidating admin sessions:', error)
    throw error
  }
}

/**
 * Invalidate share sessions for a specific recipient
 *
 * Use when:
 * - Recipient is removed from project
 * - Recipient email is changed (forces re-authentication)
 *
 * @param recipientId - The recipient ID whose sessions should be invalidated
 * @returns Number of sessions invalidated
 */
export async function invalidateRecipientSessions(recipientId: string): Promise<number> {
  try {
    const redis = getRedis()

    // Find all share page access records for this recipient
    const sessions = await prisma.sharePageAccess.findMany({
      where: {
        email: {
          not: null
        }
      },
      select: {
        sessionId: true,
        email: true
      },
      distinct: ['sessionId']
    })

    // Get recipient email to match
    const recipient = await prisma.projectRecipient.findUnique({
      where: { id: recipientId },
      select: { email: true, projectId: true }
    })

    if (!recipient?.email) {
      return 0
    }

    // Filter to only sessions that match this recipient's email
    const recipientSessions = sessions.filter(s =>
      s.email?.toLowerCase() === recipient.email?.toLowerCase()
    )

    if (recipientSessions.length === 0) {
      return 0
    }

    // Revoke each session in Redis with TTL
    const ttl = 7 * 24 * 60 * 60 // 7 days in seconds
    const pipeline = redis.pipeline()

    for (const session of recipientSessions) {
      pipeline.setex(`revoked:share_session:${session.sessionId}`, ttl, '1')
    }

    await pipeline.exec()

    console.log(`[SESSION_INVALIDATION] Invalidated ${recipientSessions.length} sessions for recipient ${recipientId} (${recipient.email})`)
    return recipientSessions.length
  } catch (error) {
    console.error('[SESSION_INVALIDATION] Error invalidating recipient sessions:', error)
    throw error
  }
}

/**
 * Invalidate share sessions for a specific email across all projects
 *
 * Use when:
 * - Email-based security concern (email compromised, etc.)
 *
 * @param email - The email address whose sessions should be invalidated
 * @returns Number of sessions invalidated
 */
export async function invalidateSessionsByEmail(email: string): Promise<number> {
  try {
    const redis = getRedis()

    const sessions = await prisma.sharePageAccess.findMany({
      where: {
        email: {
          equals: email,
          mode: 'insensitive'
        }
      },
      select: { sessionId: true },
      distinct: ['sessionId']
    })

    if (sessions.length === 0) {
      return 0
    }

    const ttl = 7 * 24 * 60 * 60 // 7 days
    const pipeline = redis.pipeline()

    for (const session of sessions) {
      pipeline.setex(`revoked:share_session:${session.sessionId}`, ttl, '1')
    }

    await pipeline.exec()

    console.log(`[SESSION_INVALIDATION] Invalidated ${sessions.length} sessions for email ${email}`)
    return sessions.length
  } catch (error) {
    console.error('[SESSION_INVALIDATION] Error invalidating sessions by email:', error)
    throw error
  }
}

/**
 * Invalidate all guest sessions for a specific project
 *
 * Use when:
 * - Guest mode is disabled but you want to keep authenticated sessions
 * - Security concern with anonymous access
 * - Need to force guests to re-enter (after guestLatestOnly changes)
 *
 * @param projectId - The project ID to invalidate guest sessions for
 * @returns Number of guest sessions invalidated
 */
export async function invalidateGuestSessions(projectId: string): Promise<number> {
  try {
    const redis = getRedis()

    // Get all unique session IDs for GUEST access method
    const sessions = await prisma.sharePageAccess.findMany({
      where: {
        projectId,
        accessMethod: 'GUEST'
      },
      select: { sessionId: true },
      distinct: ['sessionId']
    })

    if (sessions.length === 0) {
      return 0
    }

    const ttl = 7 * 24 * 60 * 60 // 7 days
    const pipeline = redis.pipeline()

    for (const session of sessions) {
      pipeline.setex(`revoked:share_session:${session.sessionId}`, ttl, '1')
    }

    await pipeline.exec()

    console.log(`[SESSION_INVALIDATION] Invalidated ${sessions.length} guest sessions for project ${projectId}`)
    return sessions.length
  } catch (error) {
    console.error('[SESSION_INVALIDATION] Error invalidating guest sessions:', error)
    throw error
  }
}

/**
 * Clear pending passkey challenges for a user
 *
 * Use when:
 * - User's passkey is deleted (prevent pending registrations)
 * - Security concern with user's passkeys
 *
 * @param userId - The user ID whose challenges should be cleared
 */
export async function clearPasskeyChallenges(userId: string): Promise<void> {
  try {
    const redis = getRedis()
    const pipeline = redis.pipeline()

    // Clear both registration and authentication challenges
    pipeline.del(`passkey:challenge:register:${userId}`)
    pipeline.del(`passkey:challenge:auth:${userId}`)

    await pipeline.exec()

    console.log(`[SESSION_INVALIDATION] Cleared passkey challenges for user ${userId}`)
  } catch (error) {
    console.error('[SESSION_INVALIDATION] Error clearing passkey challenges:', error)
    throw error
  }
}
