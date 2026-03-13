import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { verifyPasskeyRegistration } from '@/lib/passkey'
import { getClientIpAddress } from '@/lib/utils'
import type { RegistrationResponseJSON } from '@simplewebauthn/browser'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'




/**
 * Verify PassKey Registration Response
 *
 * POST /api/auth/passkey/register/verify
 *
 * SECURITY:
 * - Requires admin authentication (JWT)
 * - Retrieves and DELETES challenge from Redis (one-time use)
 * - Verifies WebAuthn response signature
 * - Stores credential in database
 * - Tracks IP and user agent for security
 *
 * Body:
 * - response: RegistrationResponseJSON from @simplewebauthn/browser
 *
 * Returns:
 * - { success: true, credentialId: string } on success
 * - { success: false, error: string } on failure
 */
export async function POST(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const authMessages = messages?.auth || {}

  try {
    // Require admin authentication
    const user = await requireApiAdmin(request)
    if (user instanceof Response) return user

    // Parse request body
    const body = await request.json()
    const response = body as RegistrationResponseJSON

    if (!response || !response.id) {
      return NextResponse.json(
        { success: false, error: authMessages.invalidRegistrationResponse || 'Invalid registration response' },
        { status: 400 }
      )
    }

    // Get client info for security tracking
    const userAgent = request.headers.get('user-agent') || undefined
    const ipAddress = getClientIpAddress(request)

    // Verify registration
    const result = await verifyPasskeyRegistration(
      user,
      response,
      userAgent,
      ipAddress
    )

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      credentialId: result.credentialId,
    })
  } catch (error) {
    logError('[PASSKEY] Registration verification error:', error)

    return NextResponse.json(
      {
        success: false,
        error: authMessages.failedToVerifyPasskeyRegistration || 'Failed to verify PassKey registration',
      },
      { status: 500 }
    )
  }
}
