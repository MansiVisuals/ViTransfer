import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { testEmailConnection } from '@/lib/email'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require admin authentication
    const authResult = await requireApiAdmin(request)
    if (authResult instanceof Response) {
      return authResult
    }

    // CSRF protection
    const csrfCheck = await validateCsrfProtection(request)
    if (csrfCheck) return csrfCheck

    const { testEmail, smtpConfig } = await request.json()

    if (!testEmail) {
      return NextResponse.json(
        { error: 'Test email address is required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(testEmail)) {
      return NextResponse.json(
        { error: 'Invalid email address format' },
        { status: 400 }
      )
    }

    // Test email connection and send test email with provided config or saved config
    const result = await testEmailConnection(testEmail, smtpConfig)

    return NextResponse.json(result)
  } catch (error: any) {
    let errorMessage = 'Failed to send test email'

    // Provide generic error messages without exposing config details
    if (error.message?.includes('SMTP settings are not configured')) {
      errorMessage = 'SMTP settings are not configured. Please configure email settings first.'
    } else if (error.code === 'EAUTH') {
      errorMessage = 'Authentication failed. Please check your SMTP credentials.'
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      errorMessage = 'Could not connect to SMTP server. Please check your settings.'
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
