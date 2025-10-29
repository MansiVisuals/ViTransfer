import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin, regenerateSession, getCurrentUserFromRequest } from '@/lib/auth'
import { hashPassword, validatePassword, verifyPassword } from '@/lib/encryption'
import { revokeAllUserTokens, clearUserRevocation } from '@/lib/token-revocation'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

// GET /api/users/[id] - Get user by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
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
        { error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error fetching user:', error)
    // SECURITY: Generic message
    return NextResponse.json(
      { error: 'Unable to process request' },
      { status: 500 }
    )
  }
}

// PATCH /api/users/[id] - Update user
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
          { error: 'Email already taken' },
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
          { error: 'Username already taken' },
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
          { error: 'Invalid role. Must be ADMIN or USER' },
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
      // SECURITY: Verify old password before allowing password change
      if (!oldPassword || oldPassword.trim() === '') {
        return NextResponse.json(
          { error: 'Current password is required to change password' },
          { status: 400 }
        )
      }

      // Get user's current password hash
      const userWithPassword = await prisma.user.findUnique({
        where: { id },
        select: { password: true },
      })

      if (!userWithPassword) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      // Verify old password
      const isOldPasswordValid = await verifyPassword(oldPassword, userWithPassword.password)
      if (!isOldPasswordValid) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 401 }
        )
      }

      // Validate new password
      const passwordValidation = validatePassword(password)
      if (!passwordValidation.isValid) {
        return NextResponse.json(
          { error: 'Password does not meet requirements', details: passwordValidation.errors },
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
        // User is changing their own password
        // Generate new session FIRST before revoking
        await regenerateSession({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        })

        // NOW revoke ALL other sessions (after new session is created)
        // The new tokens were just issued, so they won't be affected by the user-level revocation
        // because the auth check will see they were issued AFTER the revocation timestamp
        await revokeAllUserTokens(user.id)

        // DON'T clear the user revocation - let it expire naturally after 7 days
        // The new tokens will pass auth because their 'iat' (issued at) time is AFTER revocation time
      } else {
        // Admin is changing another user's password - just revoke their sessions
        await revokeAllUserTokens(user.id)
      }

      securityMessage = 'All sessions have been invalidated - user will need to log in again on other devices.'
    }

    if (roleChanged) {
      if (currentUser && currentUser.id === id) {
        // User's own role is changing - regenerate their session with new role
        await regenerateSession({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        })
        securityMessage = securityMessage
          ? `${securityMessage} Role updated - your session has been refreshed.`
          : 'Role updated - session refreshed with new permissions.'
      } else {
        // Another admin is changing this user's role - revoke all their sessions
        await revokeAllUserTokens(user.id)
        securityMessage = securityMessage
          ? `${securityMessage} Role changed - user will need to log in again.`
          : 'Role changed - user will need to log in again to reflect new permissions.'
      }
    }

    return NextResponse.json({
      user,
      message: securityMessage || 'User updated successfully'
    })
  } catch (error) {
    console.error('Error updating user:', error)
    // SECURITY: Generic message
    return NextResponse.json(
      { error: 'Operation failed' },
      { status: 500 }
    )
  }
}

// DELETE /api/users/[id] - Delete user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Delete user
    await prisma.user.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting user:', error)
    // SECURITY: Generic message
    return NextResponse.json(
      { error: 'Operation failed' },
      { status: 500 }
    )
  }
}
