import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { rateLimit } from '@/lib/rate-limit'
import { safeParseBody } from '@/lib/validation'
import { isSmtpConfigured } from '@/lib/settings'
import { getClientIpAddress } from '@/lib/utils'
import { getAppUrl } from '@/lib/url'
import {
  createPortalLinkToken,
  emailHasAnyRecipient,
  hashIpUa,
  sendPortalMagicLinkEmail,
} from '@/lib/portal-link'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  try {
    const locale = await getConfiguredLocale()
    const messages = await loadLocaleMessages(locale)
    const portalMessages = messages?.portal || {}

    const ipLimit = await rateLimit(request, {
      windowMs: 15 * 60 * 1000,
      maxRequests: 5,
      message: portalMessages.tooManyRequests || 'Too many requests. Please try again later.',
    }, 'portal-request-link-ip')
    if (ipLimit) return ipLimit

    const parsed = await safeParseBody(request)
    if (!parsed.success) return parsed.response
    const { email } = parsed.data || {}

    if (!email || typeof email !== 'string' || email.length > 255 || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: portalMessages.invalidEmail || 'Invalid email' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()
    const emailLimit = await rateLimit(request, {
      windowMs: 15 * 60 * 1000,
      maxRequests: 3,
      message: portalMessages.tooManyRequests || 'Too many requests. Please try again later.',
    }, 'portal-request-link-email', normalizedEmail)
    if (emailLimit) return emailLimit

    const successResponse = NextResponse.json({
      success: true,
      message: portalMessages.checkInbox || 'If your email is registered, you will receive a sign-in link shortly.',
    })

    if (!(await isSmtpConfigured())) {
      // Return 503 only for the operator's own visibility — users still see generic copy
      // when SMTP is fine. The 503 prevents silent black-holing of magic links.
      return NextResponse.json(
        { error: portalMessages.emailServiceUnavailable || 'Email service not configured.' },
        { status: 503 }
      )
    }

    const startTime = Date.now()

    const isRecipient = await emailHasAnyRecipient(normalizedEmail)
    if (!isRecipient) {
      const minDelay = 800
      const maxDelay = 2000
      const target = crypto.randomInt(minDelay, maxDelay + 1)
      const elapsed = Date.now() - startTime
      if (elapsed < target) {
        await new Promise((r) => setTimeout(r, target - elapsed))
      }
      return successResponse
    }

    const ip = getClientIpAddress(request)
    const ua = request.headers.get('user-agent') || ''
    const { ipHash, uaHash } = hashIpUa(ip, ua)

    const linkToken = await createPortalLinkToken({
      email: normalizedEmail,
      ipHash,
      uaHash,
    })

    const baseUrl = await getAppUrl(request)
    const magicLinkUrl = `${baseUrl}/api/portal/verify?t=${encodeURIComponent(linkToken)}`

    try {
      await sendPortalMagicLinkEmail({
        email: normalizedEmail,
        magicLinkUrl,
      })
    } catch (error) {
      logError('[PORTAL] Failed to send magic-link email:', error)
      return NextResponse.json(
        { error: portalMessages.failedToSend || 'Failed to send sign-in email. Please try again.' },
        { status: 500 }
      )
    }

    return successResponse
  } catch (error) {
    logError('[PORTAL] request-link error:', error)
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    )
  }
}
