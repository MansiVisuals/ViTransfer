import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { cookies } from 'next/headers'
import { getRedis } from '@/lib/video-access'
import { prisma } from '@/lib/db'

/**
 * Verify project access using dual authentication pattern
 *
 * Two authentication paths:
 * 1. Admin Path: JWT authentication (bypasses password protection)
 * 2. User Path: share_auth session cookie (requires password verification)
 *
 * This replaces duplicate auth logic in 6+ API routes.
 *
 * @param request - Next.js request object
 * @param projectId - Project ID to verify access for
 * @param sharePassword - Project's share password (null if not password-protected)
 * @returns Object with authorization status and user type
 */
export async function verifyProjectAccess(
  request: NextRequest,
  projectId: string,
  sharePassword: string | null
): Promise<{
  authorized: boolean
  isAdmin: boolean
  isAuthenticated: boolean
  errorResponse?: NextResponse
}> {
  // Check if user is admin (admins bypass password protection)
  const currentUser = await getCurrentUserFromRequest(request)
  const isAdmin = currentUser?.role === 'ADMIN'
  let isAuthenticated = isAdmin

  // If project has no password OR user is admin, grant access
  if (!sharePassword || isAdmin) {
    return {
      authorized: true,
      isAdmin,
      isAuthenticated
    }
  }

  // Password-protected project + non-admin user → verify share_auth cookie
  const cookieStore = await cookies()
  const authSessionId = cookieStore.get('share_auth')?.value

  if (!authSessionId) {
    return {
      authorized: false,
      isAdmin: false,
      isAuthenticated: false,
      errorResponse: NextResponse.json(
        { error: 'Password required' },
        { status: 401 }
      )
    }
  }

  // Verify auth session maps to this project
  const redis = getRedis()
  const mappedProjectId = await redis.get(`auth_project:${authSessionId}`)

  if (mappedProjectId !== projectId) {
    return {
      authorized: false,
      isAdmin: false,
      isAuthenticated: false,
      errorResponse: NextResponse.json(
        { error: 'Access denied' },
        { status: 401 }
      )
    }
  }

  // User has valid password authentication
  isAuthenticated = true

  return {
    authorized: true,
    isAdmin: false,
    isAuthenticated: true
  }
}