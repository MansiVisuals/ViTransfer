import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin, getCurrentUserFromRequest } from '@/lib/auth'
import { hashPassword, validatePassword, verifyPassword } from '@/lib/encryption'
import { revokeAllUserTokens } from '@/lib/token-revocation'
import { invalidateAdminSessions } from '@/lib/session-invalidation'
import { rateLimit } from '@/lib/rate-limit'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'



// Prevent static generation for this route
export const dynamic = 'force-dynamic'

// GET /api/users/[id] - Get user by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const usersMessages = messages?.users || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limiting: 60 requests per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: usersMessages.tooManyRequestsSlowDown || 'Too many requests. Please slow down.'
  }, 'user-read')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { id } = await params
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        // Exclude password from response
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: usersMessages.userNotFound || 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ user })
  } catch (error) {
    logError('Error fetching user:', error)
    // SECURITY: Generic message
    return NextResponse.json(
      { error: usersMessages.unableToProcessRequest || 'Unable to process request' },
      { status: 500 }
    )
  }
}

// PATCH /api/users/[id] - Update user
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const usersMessages = messages?.users || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { email, username, name, password, oldPassword, role } = body

    // Build update data
    const updateData: any = {}

    // Track if security-sensitive fields changed
    let roleChanged = false
    
    if (email !== undefined) {
      // Check if email is already taken by another user
      const existingUser = await prisma.user.findFirst({
        where: {
          email,
          NOT: { id },
        },
      })

      if (existingUser) {
        return NextResponse.json(
          { error: usersMessages.emailAlreadyTaken || 'Email already taken' },
          { status: 409 }
        )
      }

      updateData.email = email
    }

    if (username !== undefined) {
      // Check if username is already taken by another user
      const existingUsername = await prisma.user.findFirst({
        where: {
          username,
          NOT: { id },
        },
      })

      if (existingUsername) {
        return NextResponse.json(
          { error: usersMessages.usernameAlreadyTaken || 'Username already taken' },
          { status: 409 }
        )
      }

      updateData.username = username || null
    }

    if (name !== undefined) {
      updateData.name = name
    }

    if (role !== undefined) {
      // Validate role
      if (role !== 'ADMIN' && role !== 'USER') {
        return NextResponse.json(
          { error: usersMessages.invalidRoleAdminOrUser || 'Invalid role. Must be ADMIN or USER' },
          { status: 400 }
        )
      }

      // Check if role is actually changing
      const currentUserData = await prisma.user.findUnique({
        where: { id },
        select: { role: true },
      })

      if (currentUserData && currentUserData.role !== role) {
        updateData.role = role
        roleChanged = true
      }
    }

    // Track if password is being changed (for session regeneration)
    let passwordChanged = false

    // Only update password if provided
    if (password && password.trim() !== '') {
      // Get user's current password hash
      const userWithPassword = await prisma.user.findUnique({
        where: { id },
        select: { password: true },
      })

      if (!userWithPassword) {
        return NextResponse.json(
          { error: usersMessages.userNotFound || 'User not found' },
          { status: 404 }
        )
      }

      // SECURITY: Verify old password before allowing password change
      // Coerce to string so bcrypt.compare handles missing/empty values safely (returns false)
      const oldPasswordStr = typeof oldPassword === 'string' ? oldPassword : ''
      const isOldPasswordValid = await verifyPassword(oldPasswordStr, userWithPassword.password)
      if (!isOldPasswordValid) {
        return NextResponse.json(
          { error: usersMessages.currentPasswordIncorrect || 'Current password is incorrect' },
          { status: 401 }
        )
      }

      // Validate new password
      const passwordValidation = validatePassword(password)
      if (!passwordValidation.isValid) {
        return NextResponse.json(
          { error: usersMessages.passwordDoesNotMeetRequirements || 'Password does not meet requirements', details: passwordValidation.errors },
          { status: 400 }
        )
      }

      updateData.password = await hashPassword(password)
      passwordChanged = true
    }

    // Update user
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // SECURITY: Handle session security for sensitive changes
    const currentUser = await getCurrentUserFromRequest(request)
    let securityMessage = ''

    if (passwordChanged) {
      if (currentUser && currentUser.id === id) {
        // User is changing their own password - revoke all sessions to force fresh login
        await revokeAllUserTokens(user.id)
      } else {
        // Admin is changing another user's password - revoke their sessions
        await revokeAllUserTokens(user.id)
      }

      securityMessage = usersMessages.allSessionsInvalidatedUserMustLoginAgain || 'All sessions have been invalidated - user will need to log in again.'
    }

    if (roleChanged) {
      if (currentUser && currentUser.id === id) {
        // User's own role is changing - revoke sessions to refresh permissions on next login
        await revokeAllUserTokens(user.id)
        securityMessage = securityMessage
          ? `${securityMessage} ${usersMessages.roleUpdatedLoginAgainToRefreshPermissions || 'Role updated - please log in again to refresh permissions.'}`
          : (usersMessages.roleUpdatedLoginAgainToRefreshPermissions || 'Role updated - please log in again to refresh permissions.')
      } else {
        // Another admin is changing this user's role - revoke all their sessions
        await revokeAllUserTokens(user.id)
        securityMessage = securityMessage
          ? `${securityMessage} ${usersMessages.roleChangedUserMustLoginAgain || 'Role changed - user will need to log in again.'}`
          : (usersMessages.roleChangedUserMustLoginAgainToReflectPermissions || 'Role changed - user will need to log in again to reflect new permissions.')
      }
    }

    return NextResponse.json({
      user,
      message: securityMessage || usersMessages.userUpdatedSuccessfully || 'User updated successfully'
    })
  } catch (error) {
    logError('Error updating user:', error)
    // SECURITY: Generic message
    return NextResponse.json(
      { error: usersMessages.operationFailed || 'Operation failed' },
      { status: 500 }
    )
  }
}

// DELETE /api/users/[id] - Delete user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const usersMessages = messages?.users || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  try {
    const { id } = await params
    // Get current user from auth
    const currentUser = authResult

    // Prevent deleting yourself
    if (currentUser.id === id) {
      return NextResponse.json(
        { error: usersMessages.cannotDeleteOwnAccount || 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      return NextResponse.json(
        { error: usersMessages.userNotFound || 'User not found' },
        { status: 404 }
      )
    }

    // Invalidate all sessions for this user BEFORE deletion
    // This ensures any active tokens are revoked immediately
    await invalidateAdminSessions(id)

    // Delete user
    await prisma.user.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logError('Error deleting user:', error)
    // SECURITY: Generic message
    return NextResponse.json(
      { error: usersMessages.operationFailed || 'Operation failed' },
      { status: 500 }
    )
  }
}
