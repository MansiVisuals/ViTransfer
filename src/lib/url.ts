import { prisma } from './db'
import { NextRequest } from 'next/server'
import { headers } from 'next/headers'

/**
 * Get the application URL from request headers
 * Priority: DB settings → Request headers (NextRequest or Server Component) → Error
 * Automatically detects headers from Server Components when request is not provided
 */
export async function getAppUrl(request?: NextRequest): Promise<string> {
  // 1. Try database settings first
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { appDomain: true },
    })

    if (settings?.appDomain) {
      return settings.appDomain
    }
  } catch (error) {
    // DB not available, continue to request detection
  }

  // 2. Extract from request headers if available (API routes)
  if (request) {
    const proto = request.headers.get('x-forwarded-proto') ||
                  (request.url.startsWith('https') ? 'https' : 'http')
    const host = request.headers.get('x-forwarded-host') ||
                 request.headers.get('host')

    if (host) {
      return `${proto}://${host}`
    }
  }

  // 3. Try to get headers from Server Component context
  try {
    const headersList = await headers()
    const proto = headersList.get('x-forwarded-proto') || 'http'
    const host = headersList.get('x-forwarded-host') ||
                 headersList.get('host')

    if (host) {
      return `${proto}://${host}`
    }
  } catch (error) {
    // Not in a request context
  }

  // 4. No fallback - throw error
  throw new Error('Unable to determine app URL. Please configure domain in Settings or ensure request headers are available.')
}

/**
 * Get the application domain from settings
 * Falls back to empty string if not configured (NO LOCALHOST)
 */
export async function getAppDomain(): Promise<string> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { appDomain: true },
    })

    if (settings?.appDomain) {
      return settings.appDomain
    }
  } catch (error) {
    // Silent fail
  }

  // Return empty string - NO LOCALHOST FALLBACK
  return ''
}

/**
 * Generate a share URL for a project
 */
export async function generateShareUrl(
  projectSlug: string,
  request?: NextRequest
): Promise<string> {
  const baseUrl = await getAppUrl(request)
  return `${baseUrl}/share/${projectSlug}`
}
