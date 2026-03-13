export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { generateDeviceCode, storeDeviceCode } from '@/lib/device-code'
import { rateLimit } from '@/lib/rate-limit'
import { prisma } from '@/lib/db'
import { logSecurityEvent } from '@/lib/video-access'
import { getClientIpAddress } from '@/lib/utils'
import { safeParseBody } from '@/lib/validation'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'


// Valid client IDs for workflow integrations
const VALID_CLIENT_IDS = [
  'vitransfer-resolve',
  'vitransfer-premiere',
]

/**
 * POST /api/auth/device/code
 *
 * Issues a new device code for the device authorization flow.
 * No authentication required. Rate limited per IP.
 *
 * Input: { clientId: "vitransfer-resolve" | "vitransfer-premiere" }
 * Output: { deviceCode, userCode, verificationUri, verificationUriComplete, expiresIn, interval }
 */
export async function POST(request: NextRequest) {
  const ipAddress = getClientIpAddress(request)
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const authMessages = messages?.auth || {}

  // Rate limit: 10 requests per 10 minutes per IP
  const rateLimitResult = await rateLimit(request, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 10,
    message: authMessages.tooManyDeviceCodeRequests || 'Too many device code requests. Please try again later.',
  }, 'device-code')

  if (rateLimitResult) {
    void logSecurityEvent({
      type: 'DEVICE_CODE_RATE_LIMIT_HIT',
      severity: 'WARNING',
      ipAddress,
      details: { endpoint: 'device/code' },
      wasBlocked: true,
    })
    return rateLimitResult
  }

  try {
    const parsed = await safeParseBody(request)
    if (!parsed.success) return parsed.response
    const { clientId } = parsed.data

    if (!clientId || !VALID_CLIENT_IDS.includes(clientId)) {
      return NextResponse.json(
        { error: authMessages.invalidClientId || 'Invalid client_id' },
        { status: 400 }
      )
    }

    // Get appDomain from settings for verification URI
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { appDomain: true },
    })

    if (!settings?.appDomain) {
      return NextResponse.json(
        { error: authMessages.serverNotConfiguredAppDomainRequired || 'Server not configured. Application domain must be set in Settings.' },
        { status: 503 }
      )
    }

    // Generate device code and user code
    const { deviceCode, userCode } = generateDeviceCode()

    // Store in Redis
    await storeDeviceCode(deviceCode, userCode, clientId)

    // Build verification URIs
    const baseUri = settings.appDomain.replace(/\/$/, '')
    const verificationUri = `${baseUri}/device`
    const verificationUriComplete = `${baseUri}/device?code=${userCode}`

    // Log successful device code issuance
    void logSecurityEvent({
      type: 'DEVICE_CODE_ISSUED',
      severity: 'INFO',
      ipAddress,
      details: { clientId, userCode },
      wasBlocked: false,
    })

    return NextResponse.json({
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete,
      expiresIn: 600,
      interval: 5,
    })
  } catch (error) {
    logError('[Device Code] Error issuing device code:', error)
    return NextResponse.json(
      { error: authMessages.failedToIssueDeviceCode || 'Failed to issue device code' },
      { status: 500 }
    )
  }
}
