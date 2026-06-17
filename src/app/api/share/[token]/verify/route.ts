import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import crypto from 'crypto'
import { logSecurityEvent } from '@/lib/video-access'
import { getClientIpAddress } from '@/lib/utils'
import { getMaxAuthAttempts } from '@/lib/settings'
import { getRedis } from '@/lib/redis'
import { signShareToken } from '@/lib/auth'
import { getShareTokenTtlSeconds } from '@/lib/settings'
import { trackSharePageAccess, readAnalyticsConsent } from '@/lib/share-access-tracking'
import { enqueueExternalNotification } from '@/lib/external-notifications/enqueueExternalNotification'
import { safeParseBody } from '@/lib/validation'
import jwt from 'jsonwebtoken'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'




const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_TTL_SECONDS = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
// Global (all-IP) cap — the per-IP lockout is bypassable by rotating IPs.
const GLOBAL_MAX_FAILED_ATTEMPTS = 50

function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')

  // If lengths differ, still compare dummy buffers to maintain constant time
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32))
    return false
  }

  return crypto.timingSafeEqual(bufA, bufB)
}

function getIdentifier(request: NextRequest, token: string): string {
  const ip = getClientIpAddress(request)
  
  const hash = crypto
    .createHash('sha256')
    .update(`${ip}:${token}`)
    .digest('hex')
    .slice(0, 16)
  
  return `ratelimit:share-verify-failed:${token}:${hash}`
}

function getGlobalIdentifier(token: string): string {
  return `ratelimit:share-verify-failed-global:${token}`
}

interface FailedAttemptEntry {
  count: number
  firstAttempt: number
  lastAttempt: number
  lockoutUntil?: number
}

async function getActiveLockout(
  redis: ReturnType<typeof getRedis>,
  key: string,
  now: number
): Promise<{ retryAfter: number; count: number } | null> {
  const data = await redis.get(key)
  if (!data) return null
  const { count, lockoutUntil } = JSON.parse(data) as FailedAttemptEntry
  if (lockoutUntil && lockoutUntil > now) {
    return { retryAfter: Math.ceil((lockoutUntil - now) / 1000), count }
  }
  return null
}

async function registerFailedAttempt(
  redis: ReturnType<typeof getRedis>,
  key: string,
  now: number,
  maxAttempts: number
): Promise<number> {
  const existing = await redis.get(key)
  let count = 1
  let firstAttempt = now
  if (existing) {
    const prev = JSON.parse(existing) as FailedAttemptEntry
    if (now - prev.firstAttempt <= RATE_LIMIT_WINDOW_MS) {
      count = prev.count + 1
      firstAttempt = prev.firstAttempt
    }
  }
  const entry: FailedAttemptEntry = {
    count,
    firstAttempt,
    lastAttempt: now,
    lockoutUntil: count >= maxAttempts ? now + RATE_LIMIT_WINDOW_MS : undefined,
  }
  await redis.setex(key, RATE_LIMIT_TTL_SECONDS, JSON.stringify(entry))
  return count
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const locale = await getConfiguredLocale().catch(() => 'en')
    const messages = await loadLocaleMessages(locale).catch(() => null)
    const shareMessages = messages?.share
    const notificationsText = messages?.notificationsText
    const redis = getRedis()
    const rateLimitKey = getIdentifier(request, token)
    const globalRateLimitKey = getGlobalIdentifier(token)
    const now = Date.now()

    // Get max auth attempts from settings
    const MAX_FAILED_ATTEMPTS = await getMaxAuthAttempts()

    const activeLockout =
      (await getActiveLockout(redis, rateLimitKey, now)) ||
      (await getActiveLockout(redis, globalRateLimitKey, now))

    if (activeLockout) {
      await logSecurityEvent({
        type: 'PASSWORD_RATE_LIMIT_HIT',
        severity: 'WARNING',
        ipAddress: getClientIpAddress(request),
        details: {
          shareToken: token,
          failedAttempts: activeLockout.count,
          retryAfter: activeLockout.retryAfter,
        },
        wasBlocked: true,
      })

      return NextResponse.json(
        { error: shareMessages?.tooManyPasswordAttempts || 'Too many failed password attempts. Please try again later.', retryAfter: activeLockout.retryAfter },
        { status: 429, headers: { 'Retry-After': String(activeLockout.retryAfter) } }
      )
    }
    
    const parsed = await safeParseBody(request)
    if (!parsed.success) return parsed.response
    const { password } = parsed.data

    if (!password) {
      return NextResponse.json({ error: shareMessages?.passwordRequiredShort || 'Password is required' }, { status: 400 })
    }

    const project = await prisma.project.findUnique({
      where: { slug: token },
      select: {
        id: true,
        title: true,
        sharePassword: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: shareMessages?.accessDenied || 'Access denied' }, { status: 403 })
    }

    if (!project.sharePassword) {
      return NextResponse.json({ success: true })
    }

    let isValid = false
    try {
      const decryptedPassword = decrypt(project.sharePassword)
      isValid = constantTimeCompare(password, decryptedPassword)
    } catch (error) {
      logError('Error decrypting password:', error)
      isValid = false
    }

    if (!isValid) {
      const count = await registerFailedAttempt(redis, rateLimitKey, now, MAX_FAILED_ATTEMPTS)
      const globalCount = await registerFailedAttempt(redis, globalRateLimitKey, now, GLOBAL_MAX_FAILED_ATTEMPTS)
      const lockedOut = count >= MAX_FAILED_ATTEMPTS || globalCount >= GLOBAL_MAX_FAILED_ATTEMPTS

      const ipAddress = getClientIpAddress(request)

      await logSecurityEvent({
        type: 'FAILED_PASSWORD_ATTEMPT',
        severity: lockedOut ? 'CRITICAL' : 'WARNING',
        projectId: project.id,
        ipAddress,
        details: {
          shareToken: token,
          attemptNumber: count,
          maxAttempts: MAX_FAILED_ATTEMPTS,
          globalAttempts: globalCount,
          globalMaxAttempts: GLOBAL_MAX_FAILED_ATTEMPTS,
        },
        wasBlocked: false,
      })

      if (lockedOut) {
        const retryAfter = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)

        await logSecurityEvent({
          type: 'PASSWORD_LOCKOUT',
          severity: 'CRITICAL',
          projectId: project.id,
          ipAddress,
          details: {
            shareToken: token,
            failedAttempts: count,
            globalAttempts: globalCount,
            lockoutDuration: retryAfter,
            scope: globalCount >= GLOBAL_MAX_FAILED_ATTEMPTS ? 'global' : 'ip',
          },
          wasBlocked: true,
        })

        void enqueueExternalNotification({
          eventType: 'SECURITY_ALERT',
          title: notificationsText?.securityAlertTitle || 'Security Alert',
          body: (notificationsText?.sharePasswordLockoutBody || 'Share password locked out on {projectTitle} after too many failed attempts')
            .replace('{projectTitle}', project.title),
          notifyType: 'failure',
          pushData: {
            projectTitle: project.title,
            projectId: project.id,
            title: notificationsText?.securityAlertTitle || 'Security Alert',
            body: (notificationsText?.sharePasswordLockoutBody || 'Share password locked out on {projectTitle} after too many failed attempts')
              .replace('{projectTitle}', project.title),
          },
        }).catch((notificationError) => {
          logError('[SHARE VERIFY] Failed to enqueue external lockout notification:', notificationError)
        })

        return NextResponse.json(
          { error: shareMessages?.tooManyPasswordAttempts || 'Too many failed password attempts. Please try again later.', retryAfter },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        )
      }

      return NextResponse.json({ error: shareMessages?.accessDenied || 'Access denied' }, { status: 403 })
    }

    await redis.del(rateLimitKey)

    const shareTokenTtl = await getShareTokenTtlSeconds()
    const shareToken = signShareToken({
      shareId: token,
      projectId: project.id,
      permissions: ['view', 'comment', 'download'],
      guest: false,
      ttlSeconds: shareTokenTtl,
    })

    await logSecurityEvent({
      type: 'PASSWORD_ACCESS',
      severity: 'INFO',
      projectId: project.id,
      ipAddress: getClientIpAddress(request),
      details: {
        shareToken: token,
      },
      wasBlocked: false,
    })

    // Track share page access for analytics (GDPR: respect consent header)
    const shareTokenPayload = jwt.decode(shareToken) as any
    if (shareTokenPayload?.sessionId) {
      await trackSharePageAccess({
        projectId: project.id,
        accessMethod: 'PASSWORD',
        sessionId: shareTokenPayload.sessionId,
        request,
        analyticsConsent: readAnalyticsConsent(request),
      })
    }

    return NextResponse.json({ success: true, shareToken })
  } catch (error) {
    logError('Error verifying share password:', error)
    const locale = await getConfiguredLocale().catch(() => 'en')
    const messages = await loadLocaleMessages(locale).catch(() => null)
    return NextResponse.json({ error: messages?.share?.accessDenied || 'Access denied' }, { status: 403 })
  }
}
