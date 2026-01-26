export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { generateDeviceCode, storeDeviceCode } from '@/lib/device-code'
import { rateLimit } from '@/lib/rate-limit'
import { prisma } from '@/lib/db'

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
  // Rate limit: 10 requests per 10 minutes per IP
  const rateLimitResult = await rateLimit(request, {
    windowMs: 10 * 60 * 1000,
    maxRequests: 10,
    message: 'Too many device code requests. Please try again later.',
  }, 'device-code')

  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()
    const { clientId } = body

    if (!clientId || !VALID_CLIENT_IDS.includes(clientId)) {
      return NextResponse.json(
        { error: 'Invalid client_id' },
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
        { error: 'Server not configured. Application domain must be set in Settings.' },
        { status: 500 }
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

    return NextResponse.json({
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete,
      expiresIn: 600,
      interval: 5,
    })
  } catch (error) {
    console.error('[Device Code] Error issuing device code:', error)
    return NextResponse.json(
      { error: 'Failed to issue device code' },
      { status: 500 }
    )
  }
}
