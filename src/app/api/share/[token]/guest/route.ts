import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import crypto from 'crypto'
import { rateLimit } from '@/lib/rate-limit'
import { signShareToken } from '@/lib/auth'
import { getShareTokenTtlSeconds } from '@/lib/settings'
import { logSecurityEvent } from '@/lib/video-access'
import { getClientIpAddress } from '@/lib/utils'
import { trackSharePageAccess, readAnalyticsConsent } from '@/lib/share-access-tracking'
import jwt from 'jsonwebtoken'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
export const runtime = 'nodejs'




/**
 * POST /api/share/[token]/guest
 *
 * Creates a guest session for limited access (videos only, no comments/approval)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const shareMessages = messages?.share
  // Rate limiting: Prevent abuse of guest session creation
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: shareMessages?.guestTooManyAttempts || 'Too many guest access attempts. Please try again later.'
  }, 'guest-entry')
  if (rateLimitResult) return rateLimitResult

  try {
    const { token } = await params

    // Find project by slug
    const project = await prisma.project.findUnique({
      where: { slug: token },
      select: {
        id: true,
        guestMode: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: shareMessages?.accessDenied || 'Access denied' }, { status: 403 })
    }

    // Check if guest mode is enabled
    if (!project.guestMode) {
      return NextResponse.json({ error: shareMessages?.guestAccessNotEnabled || 'Guest access is not enabled for this project' }, { status: 403 })
    }

    const ttlSeconds = await getShareTokenTtlSeconds()
    const shareToken = signShareToken({
      shareId: token,
      projectId: project.id,
      permissions: ['view'],
      guest: true,
      sessionId: crypto.randomBytes(16).toString('base64url'),
      ttlSeconds,
    })

    await logSecurityEvent({
      type: 'GUEST_ACCESS',
      severity: 'INFO',
      projectId: project.id,
      ipAddress: getClientIpAddress(request),
      details: {
        shareToken: token,
        guestMode: true,
      },
      wasBlocked: false,
    })

    // Track share page access for analytics (GDPR: respect consent header)
    const shareTokenPayload = jwt.decode(shareToken) as any
    if (shareTokenPayload?.sessionId) {
      await trackSharePageAccess({
        projectId: project.id,
        accessMethod: 'GUEST',
        sessionId: shareTokenPayload.sessionId,
        request,
        analyticsConsent: readAnalyticsConsent(request),
      })
    }

    return NextResponse.json({ success: true, shareToken })
  } catch (error) {
    return NextResponse.json(
      { error: shareMessages?.unableToProcessRequest || 'Unable to process request' },
      { status: 500 }
    )
  }
}
