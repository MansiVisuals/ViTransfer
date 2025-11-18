import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { cookies } from 'next/headers'
import { getRedis } from '@/lib/redis'
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
  sharePassword: string | null,
  authMode: string = 'PASSWORD'
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

  // Determine if authentication is required
  const requiresAuth = sharePassword !== null || authMode === 'OTP' || authMode === 'BOTH'

  // If no auth required OR user is admin, grant access
  if (!requiresAuth || isAdmin) {
    return {
      authorized: true,
      isAdmin,
      isAuthenticated
    }
  }

  // Password-protected project + non-admin user → verify share_auth or share_session cookie
  const cookieStore = await cookies()
  const authSessionId = cookieStore.get('share_auth')?.value
  const shareSessionId = cookieStore.get('share_session')?.value

  if (!authSessionId && !shareSessionId) {
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

  // Verify session includes this project
  const redis = getRedis()
  let hasAccess = false

  // Check auth_projects (for password/OTP authenticated users)
  if (authSessionId) {
    const isMember = await redis.sismember(`auth_projects:${authSessionId}`, projectId)
    hasAccess = isMember === 1
  }

  // Check session_projects (for guest users and general share sessions)
  if (!hasAccess && shareSessionId) {
    const isMember = await redis.sismember(`session_projects:${shareSessionId}`, projectId)
    hasAccess = isMember === 1
  }

  if (!hasAccess) {
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

  // User has valid authentication (password or guest)
  isAuthenticated = true

  return {
    authorized: true,
    isAdmin: false,
    isAuthenticated: true
  }
}