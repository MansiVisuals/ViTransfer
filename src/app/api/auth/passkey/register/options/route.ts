import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { generatePasskeyRegistrationOptions } from '@/lib/passkey'
import { isPasskeyConfigured } from '@/lib/settings'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'

/**
 * Generate PassKey Registration Options
 *
 * POST /api/auth/passkey/register/options
 *
 * SECURITY:
 * - Requires admin authentication (JWT)
 * - Checks if PassKey is configured (appDomain in Settings)
 * - Generates challenge and stores in Redis (5-min TTL)
 * - Challenge is one-time use (deleted after verification)
 *
 * Returns:
 * - PublicKeyCredentialCreationOptions for browser
 */
export async function POST(request: NextRequest) {
  try {
    // Require admin authentication
    const user = await requireApiAdmin(request)
    if (user instanceof Response) return user

    // CSRF protection
    const csrfCheck = await validateCsrfProtection(request)
    if (csrfCheck) return csrfCheck

    // Check if PassKey is configured
    const configured = await isPasskeyConfigured()
    if (!configured) {
      return NextResponse.json(
        {
          error:
            'PassKey authentication is not configured. Please set your domain in Settings first.',
        },
        { status: 503 }
      )
    }

    // Generate registration options
    const options = await generatePasskeyRegistrationOptions(user)

    return NextResponse.json(options)
  } catch (error) {
    console.error('[PASSKEY] Registration options error:', error)

    // Return user-friendly error
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.includes('PASSKEY_CONFIG_ERROR')
            ? error.message.replace('PASSKEY_CONFIG_ERROR: ', '')
            : 'Failed to generate PassKey registration options',
      },
      { status: 500 }
    )
  }
}
