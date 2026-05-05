import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { parseBearerToken, signShareToken } from '@/lib/auth'
import { getShareTokenTtlSeconds } from '@/lib/settings'
import { verifyPortalSession } from '@/lib/portal-token'
import { logSecurityEvent } from '@/lib/video-access'
import { getClientIpAddress } from '@/lib/utils'
import { trackSharePageAccess, readAnalyticsConsent } from '@/lib/share-access-tracking'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const limit = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 30,
      message: 'Too many requests. Please slow down.',
    }, 'portal-claim')
    if (limit) return limit

    const bearer = parseBearerToken(request)
    if (!bearer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const session = await verifyPortalSession(bearer)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token } = await params

    const project = await prisma.project.findUnique({
      where: { slug: token },
      select: {
        id: true,
        title: true,
        status: true,
        recipients: {
          where: { email: { equals: session.email, mode: 'insensitive' } },
          select: { id: true, email: true },
        },
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (project.status !== 'IN_REVIEW' && project.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Project not available' }, { status: 403 })
    }

    const recipient = project.recipients[0]
    if (!recipient) {
      // Email is not on this project — log and refuse.
      await logSecurityEvent({
        type: 'PORTAL_CLAIM_DENIED',
        severity: 'WARNING',
        projectId: project.id,
        ipAddress: getClientIpAddress(request),
        details: {
          shareToken: token,
          email: session.email,
          reason: 'not_a_recipient',
        },
        wasBlocked: true,
      })
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const ttlSeconds = await getShareTokenTtlSeconds()
    const shareToken = signShareToken({
      shareId: token,
      projectId: project.id,
      permissions: ['view', 'comment', 'download'],
      guest: false,
      sessionId: crypto.randomBytes(16).toString('base64url'),
      recipientId: recipient.id,
      authMode: 'PORTAL',
      ttlSeconds,
    })

    await logSecurityEvent({
      type: 'PORTAL_CLAIM_SUCCESS',
      severity: 'INFO',
      projectId: project.id,
      ipAddress: getClientIpAddress(request),
      details: { shareToken: token, email: session.email },
      wasBlocked: false,
    })

    const decoded = jwt.decode(shareToken) as { sessionId?: string } | null
    if (decoded?.sessionId) {
      await trackSharePageAccess({
        projectId: project.id,
        accessMethod: 'OTP',
        email: session.email,
        sessionId: decoded.sessionId,
        request,
        analyticsConsent: readAnalyticsConsent(request),
      })
    }

    return NextResponse.json({ success: true, shareToken })
  } catch (error) {
    logError('[PORTAL] portal-claim error:', error)
    return NextResponse.json({ error: 'Failed to claim access' }, { status: 500 })
  }
}
