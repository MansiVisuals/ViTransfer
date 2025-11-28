import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { verifyProjectAccess } from '@/lib/project-access'
import { trackVideoAccess } from '@/lib/video-access'
import { getRedis } from '@/lib/redis'
import { prisma } from '@/lib/db'
import { getCurrentUserFromRequest } from '@/lib/auth'
export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

const VISIT_TTL_MS = 30 * 60 * 1000 // 30 minutes

export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 120,
    message: 'Too many requests. Please slow down.'
  }, 'analytics-visit')
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json().catch(() => ({}))
    const { projectId, videoId } = body || {}

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    // Fetch project auth details
    const projectMeta = await prisma.project.findUnique({
      where: { id: projectId },
      select: { sharePassword: true, authMode: true, slug: true }
    })

    if (!projectMeta) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Verify access via admin or share token
    const accessCheck = await verifyProjectAccess(request, projectId, projectMeta.sharePassword, projectMeta.authMode)
    if (!accessCheck.authorized) {
      return accessCheck.errorResponse || NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Skip tracking for admin users - admins shouldn't inflate visit metrics
    if (accessCheck.isAdmin) {
      return NextResponse.json({ success: true })
    }

    // Build a stable session key for deduping (client visits only)
    const sessionKey = accessCheck.shareTokenSessionId || `anon:${projectMeta.slug}`

    const redis = getRedis()
    const dedupeKey = `analytics:visit:${projectId}:${sessionKey}`
    const existing = await redis.get(dedupeKey)
    if (existing) {
      return NextResponse.json({ success: true })
    }

    // Mark visit
    await redis.setex(dedupeKey, Math.ceil(VISIT_TTL_MS / 1000), '1')

    const resolvedVideoId = videoId || null
    if (resolvedVideoId) {
      await trackVideoAccess({
        videoId: resolvedVideoId,
        projectId,
        sessionId: sessionKey,
        request,
        quality: 'page',
        eventType: 'PAGE_VISIT'
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to record visit' }, { status: 500 })
  }
}
