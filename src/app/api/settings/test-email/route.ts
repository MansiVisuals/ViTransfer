import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { testEmailConnection } from '@/lib/email'
import { emailSchema } from '@/lib/validation'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
export const runtime = 'nodejs'




export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const settingsMessages = messages?.settings || {}
  const emailMessages = settingsMessages.email || {}

  try {
    // SECURITY: Require admin authentication
    const authResult = await requireApiAdmin(request)
    if (authResult instanceof Response) {
      return authResult
    }

    const { testEmail, smtpConfig } = await request.json()

    if (!testEmail) {
      return NextResponse.json(
        { error: emailMessages.testEmailAddressRequired || 'Test email address is required' },
        { status: 400 }
      )
    }

    // Validate email format using Zod schema
    const parsed = emailSchema.safeParse(testEmail)
    if (!parsed.success) {
      return NextResponse.json(
        { error: emailMessages.invalidEmailAddressFormat || 'Invalid email address format' },
        { status: 400 }
      )
    }

    // SECURITY: If smtpPassword is the masked placeholder, replace with stored password
    if (smtpConfig?.smtpPassword === '••••••••') {
      const stored = await prisma.settings.findUnique({
        where: { id: 'default' },
        select: { smtpPassword: true },
      })
      smtpConfig.smtpPassword = stored?.smtpPassword ? decrypt(stored.smtpPassword) : null
    }

    // Test email connection and send test email with provided config or saved config
    const result = await testEmailConnection(testEmail, smtpConfig)

    return NextResponse.json(result)
  } catch (error: any) {
    let errorMessage = 'Failed to send test email'

    // Provide generic error messages without exposing config details
    if (error.message?.includes('SMTP settings are not configured')) {
      errorMessage = emailMessages.smtpSettingsNotConfigured || 'SMTP settings are not configured. Please configure email settings first.'
    } else if (error.code === 'EAUTH') {
      errorMessage = emailMessages.smtpAuthenticationFailed || 'Authentication failed. Please check your SMTP credentials.'
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      errorMessage = emailMessages.couldNotConnectToSmtpServer || 'Could not connect to SMTP server. Please check your settings.'
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
