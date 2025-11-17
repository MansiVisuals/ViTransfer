import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/security/events
 *
 * Fetch security events with filtering and pagination
 * ADMIN ONLY - requires authentication
 */
export async function GET(request: NextRequest) {
  // Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting to prevent excessive log queries
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
    message: 'Too many requests. Please slow down.'
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
        { error: 'Security events dashboard is disabled' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const type = searchParams.get('type') || undefined
    const severity = searchParams.get('severity') || undefined
    const projectId = searchParams.get('projectId') || undefined

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}
    if (type) where.type = type
    if (severity) where.severity = severity
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
    console.error('Error fetching security events:', error)
    return NextResponse.json(
      { error: 'Failed to fetch security events' },
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
  // Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const body = await request.json()
    const { olderThan } = body // Days (0 = delete all)

    if (olderThan === undefined || olderThan === null || olderThan < 0) {
      return NextResponse.json(
        { error: 'olderThan must be 0 or greater (0 = delete all)' },
        { status: 400 }
      )
    }

    let result
    let message

    if (olderThan === 0) {
      // Delete all events
      result = await prisma.securityEvent.deleteMany({})
      message = `Deleted all ${result.count} security events`
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
      message = `Deleted ${result.count} events older than ${olderThan} days`
    }

    return NextResponse.json({
      success: true,
      deleted: result.count,
      message
    })
  } catch (error) {
    console.error('Error deleting security events:', error)
    return NextResponse.json(
      { error: 'Failed to delete security events' },
      { status: 500 }
    )
  }
}
