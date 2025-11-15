import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyOTP, verifyRecipientEmail } from '@/lib/otp'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { logSecurityEvent, getRedis } from '@/lib/video-access'
import { getClientIpAddress } from '@/lib/utils'
import { getClientSessionTimeoutSeconds, isHttpsEnabled } from '@/lib/settings'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const { email, code } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Verification code is required' },
        { status: 400 }
      )
    }

    // SECURITY: Validate input lengths to prevent DoS
    if (email.length > 255) {
      return NextResponse.json(
        { error: 'Invalid email' },
        { status: 400 }
      )
    }

    if (code.length > 10) {
      return NextResponse.json(
        { error: 'Invalid code' },
        { status: 400 }
      )
    }

    // Validate code is numeric
    if (!/^\d+$/.test(code.trim())) {
      return NextResponse.json(
        { error: 'Invalid code' },
        { status: 400 }
      )
    }

    // Get project
    const project = await prisma.project.findUnique({
      where: { slug: token },
      select: {
        id: true,
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

    // Verify email is a project recipient
    const isRecipient = await verifyRecipientEmail(email, project.id)
    if (!isRecipient) {
      // SECURITY: Don't reveal if email is valid - return generic error
      // This prevents email enumeration attacks
      return NextResponse.json(
        { error: 'Invalid or expired code' },
        { status: 403 }
      )
    }

    // Verify OTP
    const result = await verifyOTP(email, project.id, code)

    if (!result.success) {
      // Log security event for failed OTP verification
      const ipAddress = getClientIpAddress(request)
      await logSecurityEvent({
        type: 'OTP_VERIFICATION_FAILED',
        severity: 'WARNING',
        projectId: project.id,
        ipAddress,
        details: {
          shareToken: token,
          email,
          error: result.error,
          attemptsLeft: result.attemptsLeft,
        },
        wasBlocked: false,
      })

      // SECURITY: Return same generic error as non-recipient to prevent enumeration
      // Don't reveal specific details like attempts remaining
      return NextResponse.json(
        {
          error: 'Invalid or expired code',
        },
        { status: 403 }
      )
    }

    // SUCCESS - Create session (same as password flow)
    const redis = getRedis()

    // Generate unique auth session ID (no project ID exposure)
    const authSessionId = crypto.randomBytes(16).toString('base64url')

    // Get configurable client session timeout and HTTPS setting
    const sessionTimeoutSeconds = await getClientSessionTimeoutSeconds()
    const httpsEnabled = await isHttpsEnabled()

    // Store auth → project mapping in Redis
    await redis.set(
      `auth_project:${authSessionId}`,
      project.id,
      'EX',
      sessionTimeoutSeconds
    )

    // Set generic authentication cookie (no project ID exposure)
    const cookieStore = await cookies()
    cookieStore.set('share_auth', authSessionId, {
      httpOnly: true,
      secure: httpsEnabled,
      sameSite: 'strict',
      path: '/',
      maxAge: sessionTimeoutSeconds,
    })

    // Log security event for successful OTP verification
    const ipAddress = getClientIpAddress(request)
    await logSecurityEvent({
      type: 'OTP_VERIFICATION_SUCCESS',
      severity: 'INFO',
      projectId: project.id,
      ipAddress,
      details: {
        shareToken: token,
        email,
      },
      wasBlocked: false,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error verifying OTP:', error)
    return NextResponse.json(
      { error: 'Failed to verify code' },
      { status: 500 }
    )
  }
}
