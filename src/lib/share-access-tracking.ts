import { prisma } from './db'
import { NextRequest } from 'next/server'
import { getSecuritySettings } from './video-access'

export async function trackSharePageAccess(params: {
  projectId: string
  accessMethod: 'OTP' | 'PASSWORD' | 'GUEST' | 'NONE'
  email?: string
  sessionId: string
  request: NextRequest
}) {
  const { projectId, accessMethod, email, sessionId, request } = params

  // Check if analytics tracking is enabled
  const settings = await getSecuritySettings()
  if (!settings.trackAnalytics) {
    return
  }

  // Get IP address from headers
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown'
  const userAgent = request.headers.get('user-agent') || undefined

  try {
    await prisma.sharePageAccess.create({
      data: {
        projectId,
        accessMethod,
        email,
        sessionId,
        ipAddress,
        userAgent,
      },
    })
  } catch (error) {
    console.error('[ANALYTICS] Failed to track share page access:', error)
    // Don't throw - analytics failures shouldn't break authentication
  }
}
