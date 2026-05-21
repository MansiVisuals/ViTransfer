import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { generatePasswordResetToken, buildPasswordResetUrl } from '@/lib/password-reset'
import { sendPasswordResetEmail } from '@/lib/email'
import { logSecurityEvent } from '@/lib/video-access'
import { getAppDomain } from '@/lib/url'
import { getClientIpAddress } from '@/lib/utils'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError, logMessage } from '@/lib/logging'


export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/forgot-password
 * SECURITY: Always returns success to prevent email enumeration.
 */
export async function POST(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const authMessages = messages?.auth || {}

  const rateLimitResult = await rateLimit(request, {
    windowMs: 15 * 60 * 1000,
    maxRequests: 3,
    message: authMessages.tooManyPasswordResetRequests || 'Too many password reset requests. Please try again later.',
  }, 'forgot-password')

  if (rateLimitResult) {
    await logSecurityEvent({
      type: 'ADMIN_PASSWORD_RESET_RATE_LIMIT_HIT',
      severity: 'WARNING',
      ipAddress: getClientIpAddress(request),
      details: {
        reason: 'Too many password reset requests',
      },
    })
    return rateLimitResult
  }

  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body?.email === 'string' ? body.email.trim() : ''

    // Always return success to prevent email enumeration
    const successResponse = NextResponse.json({
      success: true,
      message: authMessages.passwordResetEmailSentGeneric || 'If an account exists with this email, you will receive password reset instructions.',
    })

    if (!email || email.length === 0) {
      return successResponse
    }

    // Per-email rate limit: prevents flooding one victim's inbox by rotating IPs
    const emailRateLimitResult = await rateLimit(request, {
      windowMs: 15 * 60 * 1000,
      maxRequests: 3,
      message: authMessages.tooManyPasswordResetRequests || 'Too many password reset requests. Please try again later.',
    }, 'forgot-password-email', email.toLowerCase())

    if (emailRateLimitResult) {
      await logSecurityEvent({
        type: 'ADMIN_PASSWORD_RESET_RATE_LIMIT_HIT',
        severity: 'WARNING',
        ipAddress: getClientIpAddress(request),
        details: {
          reason: 'Too many password reset requests for this email',
          email,
        },
      })
      // Return generic success so attackers can't tell which emails are being targeted
      return successResponse
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: email, mode: 'insensitive' } },
          { username: { equals: email, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    })

    if (!user) {
      await logSecurityEvent({
        type: 'ADMIN_PASSWORD_RESET_UNKNOWN_EMAIL',
        severity: 'INFO',
        ipAddress: getClientIpAddress(request),
        details: {
          email,
        },
      })
      return successResponse
    }

    const settings = await prisma.settings.findFirst()
    const smtpConfigured = !!(
      settings?.smtpServer &&
      settings?.smtpPort &&
      settings?.smtpFromAddress
    )

    // Log the reset request
    await logSecurityEvent({
      type: 'ADMIN_PASSWORD_RESET_REQUESTED',
      severity: 'INFO',
      ipAddress: getClientIpAddress(request),
      details: {
        userId: user.id,
        email: user.email,
      },
    })

    const token = generatePasswordResetToken({
      userId: user.id,
      userEmail: user.email,
      expiresInMinutes: 30,
    })

    // Build reset URL from configured app domain only (prevents host-header poisoning)
    const appUrl = await getAppDomain()
    if (!appUrl) {
      await logSecurityEvent({
        type: 'ADMIN_PASSWORD_RESET_EMAIL_FAILED',
        severity: 'WARNING',
        ipAddress: getClientIpAddress(request),
        details: {
          userId: user.id,
          email: user.email,
          reason: 'App domain not configured',
        },
      })
      return successResponse
    }
    const resetUrl = buildPasswordResetUrl(appUrl, token)

    if (smtpConfigured) {
      try {
        await sendPasswordResetEmail({
          adminEmail: user.email,
          adminName: user.name || 'Admin',
          resetUrl,
        })

        await logSecurityEvent({
          type: 'ADMIN_PASSWORD_RESET_EMAIL_SENT',
          severity: 'INFO',
          ipAddress: getClientIpAddress(request),
          details: {
            userId: user.id,
            email: user.email,
          },
        })
      } catch (emailError) {
        logError(`[PASSWORD_RESET] Email send error for userId ${user.id}`, emailError)
        await logSecurityEvent({
          type: 'ADMIN_PASSWORD_RESET_EMAIL_FAILED',
          severity: 'WARNING',
          ipAddress: getClientIpAddress(request),
          details: {
            userId: user.id,
            email: user.email,
            error: emailError instanceof Error ? emailError.message : 'Unknown error',
          },
        })
        // Still return success to prevent info leak
      }
    } else {
      logMessage(`[PASSWORD_RESET] SMTP not configured, reset token generated but email not sent (userId=${user.id})`)
      await logSecurityEvent({
        type: 'ADMIN_PASSWORD_RESET_EMAIL_FAILED',
        severity: 'WARNING',
        ipAddress: getClientIpAddress(request),
        details: {
          userId: user.id,
          email: user.email,
          reason: 'SMTP not configured',
        },
      })
    }

    return successResponse
  } catch (error) {
    logError('[PASSWORD_RESET] Error:', error)
    return NextResponse.json({
      success: true,
      message: authMessages.passwordResetEmailSentGeneric || 'If an account exists with this email, you will receive password reset instructions.',
    })
  }
}
