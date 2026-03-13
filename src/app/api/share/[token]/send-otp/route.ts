import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { getRecipientLocale } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {

  generateOTP,
  verifyRecipientEmail,
  checkOTPRateLimit,
  storeOTP,
  sendOTPEmail,

} from '@/lib/otp'
import { logSecurityEvent } from '@/lib/video-access'
import { getClientIpAddress } from '@/lib/utils'
import { isSmtpConfigured } from '@/lib/email'
import { enqueueExternalNotification } from '@/lib/external-notifications/enqueueExternalNotification'
import { getAppUrl } from '@/lib/url'
import { buildUnsubscribeUrl, generateRecipientUnsubscribeToken } from '@/lib/unsubscribe'
import { safeParseBody } from '@/lib/validation'
import crypto from 'crypto'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const configuredLocale = await getConfiguredLocale()
    const messages = await loadLocaleMessages(configuredLocale)
  const shareMessages = messages?.share || {}
  const notificationsText = messages?.notificationsText || {}

    const { token } = await params
    const parsed = await safeParseBody(request)
    if (!parsed.success) return parsed.response
    const { email } = parsed.data

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
  { error: shareMessages.emailRequired || 'Email is required' },
        { status: 400 }
      )
    }

    // SECURITY: Validate email length to prevent DoS
    if (email.length > 255) {
      return NextResponse.json(
  { error: shareMessages.invalidEmail || 'Invalid email' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
  { error: shareMessages.invalidEmail || 'Invalid email format' },
        { status: 400 }
      )
    }

    // Check if SMTP is configured
    const smtpConfigured = await isSmtpConfigured()
    if (!smtpConfigured) {
      return NextResponse.json(
  { error: shareMessages.emailServiceUnavailable || 'Email service not configured. Please contact the administrator.' },
        { status: 503 }
      )
    }

    // Get project
    const project = await prisma.project.findUnique({
      where: { slug: token },
      select: {
        id: true,
        title: true,
        authMode: true,
      },
    })

    if (!project) {
      return NextResponse.json(
  { error: shareMessages.accessDenied || 'Access denied' },
        { status: 403 }
      )
    }

    // Check if OTP is enabled for this project
    if (project.authMode !== 'OTP' && project.authMode !== 'BOTH') {
      return NextResponse.json(
        { error: shareMessages.otpNotEnabled || 'OTP authentication not enabled for this project' },
        { status: 403 }
      )
    }

    // SECURITY: Check rate limit BEFORE verifying recipient to prevent enumeration
    // This ensures attackers can't determine valid recipients via rate limit differences
    const rateLimitCheck = await checkOTPRateLimit(email, project.id)
    if (rateLimitCheck.limited) {
      // SECURITY: Return generic message to prevent enumeration via rate limit
      // Don't reveal if this email is actually a recipient or not
      const ipAddress = getClientIpAddress(request)
      await logSecurityEvent({
        type: 'OTP_RATE_LIMIT_HIT',
        severity: 'WARNING',
        projectId: project.id,
        ipAddress,
        details: {
          shareToken: token,
          email,
          retryAfter: rateLimitCheck.retryAfter,
        },
        wasBlocked: true,
      })

      return NextResponse.json(
        {
          error: shareMessages.tooManyRequests || 'Too many requests. Please try again later.',
          retryAfter: rateLimitCheck.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitCheck.retryAfter || 900),
          },
        }
      )
    }

    // SECURITY: Track start time to add timing randomization
    // This prevents timing attacks that could enumerate valid recipients
    const startTime = Date.now()

    // Verify email is a project recipient (after rate limit check)
    const isRecipient = await verifyRecipientEmail(email, project.id)
    if (!isRecipient) {
      // SECURITY: Don't reveal if email is valid or not - return success anyway
      // This prevents email enumeration attacks
      const ipAddress = getClientIpAddress(request)
      await logSecurityEvent({
        type: 'UNAUTHORIZED_OTP_REQUEST',
        severity: 'WARNING',
        projectId: project.id,
        ipAddress,
        details: {
          shareToken: token,
          attemptedEmail: email,
        },
        wasBlocked: false,
      })

      void enqueueExternalNotification({
        eventType: 'SHARE_ACCESS',
        title: (shareMessages.unauthorizedOtpRequestTitle || 'Unauthorized Access Attempt: {projectTitle}').replace('{projectTitle}', project.title),
        body: await (async () => {
          const baseUrl = await getAppUrl(request).catch(() => '')
          const link = baseUrl ? `${baseUrl}/share/${token}` : null
          const requestBody = (shareMessages.unauthorizedOtpRequestBody || '{email} requested access but is not a registered recipient')
            .replace('{email}', email)

          return [
            requestBody,
            (notificationsText.method || 'Method: {method}').replace('{method}', shareMessages.otpMethod || 'OTP'),
            link ? (notificationsText.link || 'Link: {url}').replace('{url}', link) : null,
          ]
            .filter(Boolean)
            .join('\n')
        })(),
        notifyType: 'warning',
        pushData: {
          projectTitle: project.title,
          projectId: project.id,
          email,
          title: (shareMessages.unauthorizedOtpRequestTitle || 'Unauthorized Access Attempt: {projectTitle}').replace('{projectTitle}', project.title),
          body: (shareMessages.unauthorizedOtpRequestBody || '{email} requested access but is not a registered recipient').replace('{email}', email),
        },
      }).catch(() => {})

      // SECURITY: Add random delay to match timing of valid email path
      // Valid emails take 500-2000ms for SMTP + Redis + DB, match that range here
      const minDelay = 800
      const maxDelay = 2000
      const randomDelay = crypto.randomInt(minDelay, maxDelay + 1)
      const elapsed = Date.now() - startTime
      if (elapsed < randomDelay) {
        await new Promise(resolve => setTimeout(resolve, randomDelay - elapsed))
      }

      // Return success message without actually sending OTP
      return NextResponse.json({
        success: true,
        message: shareMessages.otpRequestSubmitted || 'If your email is registered for this project, you will receive a verification code shortly',
      })
    }

    // Generate OTP
    const code = generateOTP()

    // Store OTP in Redis
    await storeOTP(email, project.id, code)

    const recipient = await prisma.projectRecipient.findFirst({
      where: {
        projectId: project.id,
        email: { equals: email, mode: 'insensitive' },
      },
      select: { id: true, email: true },
    })

    let unsubscribeUrl: string | undefined
    if (recipient?.email) {
      try {
        const token = generateRecipientUnsubscribeToken({
          recipientId: recipient.id,
          projectId: project.id,
          recipientEmail: recipient.email,
        })
        const appUrl = await getAppUrl(request).catch(() => '')
        if (appUrl) {
          unsubscribeUrl = buildUnsubscribeUrl(appUrl, token)
        }
      } catch {
        unsubscribeUrl = undefined
      }
    }

    // Send OTP email
    try {
      const recipientLocale = await getRecipientLocale(email)
      await sendOTPEmail(email, project.title, code, unsubscribeUrl, recipientLocale)
    } catch (error) {
      logError('Error sending OTP email:', error)
      return NextResponse.json(
        { error: shareMessages.failedToSendCode || 'Failed to send verification code. Please try again.' },
        { status: 500 }
      )
    }

    // Log security event for OTP sent
    const ipAddress = getClientIpAddress(request)
    await logSecurityEvent({
      type: 'OTP_SENT',
      severity: 'INFO',
      projectId: project.id,
      ipAddress,
      details: {
        shareToken: token,
        email,
      },
      wasBlocked: false,
    })

    return NextResponse.json({
      success: true,
      message: shareMessages.otpRequestSubmitted || 'If your email is registered for this project, you will receive a verification code shortly',
    })
  } catch (error) {
    logError('Error sending OTP:', error)
    const locale = await getConfiguredLocale().catch(() => 'en')
    const messages = await loadLocaleMessages(locale).catch(() => null)
    const shareMessages = messages?.share || {}
    return NextResponse.json(
      { error: shareMessages.failedToSendCodeShort || 'Failed to send verification code' },
      { status: 500 }
    )
  }
}
