import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { parseBearerToken } from '@/lib/auth'
import { verifyPortalSession } from '@/lib/portal-token'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    // Cheap network-layer guard against unauthenticated spammers before we touch JWT verify.
    const ipLimit = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 120,
      message: 'Too many requests. Please slow down.',
    }, 'portal-projects-ip')
    if (ipLimit) return ipLimit

    const bearer = parseBearerToken(request)
    if (!bearer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const session = await verifyPortalSession(bearer)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Per-session quota — one stolen IP with N sessions can't pool quotas.
    const sessionLimit = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 60,
      message: 'Too many requests. Please slow down.',
    }, 'portal-projects-session', session.sessionId)
    if (sessionLimit) return sessionLimit

    const projects = await prisma.project.findMany({
      where: {
        status: { in: ['IN_REVIEW', 'APPROVED'] },
        recipients: {
          some: {
            email: { equals: session.email, mode: 'insensitive' },
          },
        },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        dueDate: true,
        updatedAt: true,
        approvedAt: true,
      },
      orderBy: [
        { updatedAt: 'desc' },
      ],
    })

    // Sort: needs-attention (IN_REVIEW) first, then most recent activity.
    const sorted = projects.slice().sort((a, b) => {
      const aNeeds = a.status === 'IN_REVIEW' ? 0 : 1
      const bNeeds = b.status === 'IN_REVIEW' ? 0 : 1
      if (aNeeds !== bNeeds) return aNeeds - bNeeds
      return b.updatedAt.getTime() - a.updatedAt.getTime()
    })

    return NextResponse.json({
      projects: sorted.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        status: p.status,
        dueDate: p.dueDate ? p.dueDate.toISOString() : null,
        lastActivityAt: p.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    logError('[PORTAL] projects error:', error)
    return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 })
  }
}
