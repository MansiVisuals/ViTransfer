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
export const runtime = 'nodejs'


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // SECURITY: Validate email length to prevent DoS
    if (email.length > 255) {
      return NextResponse.json(
        { error: 'Invalid email' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Check if SMTP is configured
    const smtpConfigured = await isSmtpConfigured()
    if (!smtpConfigured) {
      return NextResponse.json(
        { error: 'Email service not configured. Please contact the administrator.' },
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
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Check if OTP is enabled for this project
    if (project.authMode !== 'OTP' && project.authMode !== 'BOTH') {
      return NextResponse.json(
        { error: 'OTP authentication not enabled for this project' },
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
          error: 'Too many requests. Please try again later.',
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

      // SECURITY: Add random delay to match timing of valid email path
      // Valid emails take 100-500ms for SMTP, add equivalent delay here
      const minDelay = 150
      const maxDelay = 500
      const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay
      const elapsed = Date.now() - startTime
      if (elapsed < randomDelay) {
        await new Promise(resolve => setTimeout(resolve, randomDelay - elapsed))
      }

      // Return success message without actually sending OTP
      return NextResponse.json({
        success: true,
        message: 'If your email is registered for this project, you will receive a verification code shortly',
      })
    }

    // Generate OTP
    const code = generateOTP()

    // Store OTP in Redis
    await storeOTP(email, project.id, code)

    // Send OTP email
    try {
      await sendOTPEmail(email, project.title, code)
    } catch (error) {
      console.error('Error sending OTP email:', error)
      return NextResponse.json(
        { error: 'Failed to send verification code. Please try again.' },
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
      message: 'If your email is registered for this project, you will receive a verification code shortly',
    })
  } catch (error) {
    console.error('Error sending OTP:', error)
    return NextResponse.json(
      { error: 'Failed to send verification code' },
      { status: 500 }
    )
  }
}
