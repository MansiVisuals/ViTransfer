import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { getRedis } from '@/lib/redis'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'




export const dynamic = 'force-dynamic'

/**
 * GET /api/security/events
 *
 * Fetch security events with filtering and pagination
 * ADMIN ONLY - requires authentication
 */
export async function GET(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const securityMessages = messages?.security || {}

  // Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting to prevent excessive log queries
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
    message: securityMessages.tooManyRequestsSlowDown || 'Too many requests. Please slow down.'
  }, 'security-events-read')
  if (rateLimitResult) return rateLimitResult

  try {
    // Check if security events viewing is enabled
    const settings = await prisma.securitySettings.findUnique({
      where: { id: 'default' },
      select: { viewSecurityEvents: true }
    })

    if (!settings?.viewSecurityEvents) {
      return NextResponse.json(
        { error: securityMessages.securityEventsDashboardDisabled || 'Security events dashboard is disabled' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const type = searchParams.get('type') || undefined
    const severity = searchParams.get('severity') || undefined
    const projectId = searchParams.get('projectId') || undefined

    const skip = (page - 1) * limit

    // Build where clause (supports comma-separated values for multi-select)
    const where: any = {}
    if (type) {
      const types = type.split(',').filter(Boolean)
      where.type = types.length === 1 ? types[0] : { in: types }
    }
    if (severity) {
      const severities = severity.split(',').filter(Boolean)
      where.severity = severities.length === 1 ? severities[0] : { in: severities }
    }
    if (projectId) where.projectId = projectId

    // Fetch events with pagination
    const [events, total] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          project: {
            select: {
              id: true,
              title: true,
              slug: true,
            }
          }
        }
      }),
      prisma.securityEvent.count({ where })
    ])

    // Get summary stats
    const stats = await prisma.securityEvent.groupBy({
      by: ['type'],
      _count: {
        id: true
      }
    })

    return NextResponse.json({
      events,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      stats: stats.map(s => ({
        type: s.type,
        count: s._count.id
      }))
    })
  } catch (error) {
    logError('Error fetching security events:', error)
    return NextResponse.json(
      { error: securityMessages.failedToFetchSecurityEvents || 'Failed to fetch security events' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/security/events
 *
 * Delete old security events
 * ADMIN ONLY - requires authentication
 */
export async function DELETE(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const securityMessages = messages?.security || {}

  // Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: securityMessages.tooManyRequestsSlowDown || 'Too many requests. Please slow down.'
  }, 'security-events-delete', authResult.id)
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()
    const { olderThan } = body // Days (0 = delete all)

    if (olderThan === undefined || olderThan === null || olderThan < 0) {
      return NextResponse.json(
        { error: securityMessages.olderThanMustBeZeroOrGreater || 'olderThan must be 0 or greater (0 = delete all)' },
        { status: 400 }
      )
    }

    let result
    let message

    if (olderThan === 0) {
      // Delete all events
      result = await prisma.securityEvent.deleteMany({})

      // Also clear the Redis recent events list
      const redis = getRedis()
      await redis.del('security:events:recent')

  message = (securityMessages.deletedAllSecurityEvents || 'Deleted all {count} security events').replace('{count}', String(result.count))
    } else {
      // Delete events older than specified days
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - olderThan)

      result = await prisma.securityEvent.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate
          }
        }
      })

      // Trim Redis recent events list to remove stale entries
      // (Redis list is capped at 1000 entries with auto-trim, so clearing
      // the whole list is acceptable — new events will repopulate it)
      if (result.count > 0) {
        const redis = getRedis()
        await redis.del('security:events:recent')
      }

  message = (securityMessages.deletedEventsOlderThanDays || 'Deleted {count} events older than {days} days').replace('{count}', String(result.count)).replace('{days}', String(olderThan))
    }

    return NextResponse.json({
      success: true,
      deleted: result.count,
      message
    })
  } catch (error) {
    logError('Error deleting security events:', error)
    return NextResponse.json(
      { error: securityMessages.failedToDeleteSecurityEventsApi || 'Failed to delete security events' },
      { status: 500 }
    )
  }
}
