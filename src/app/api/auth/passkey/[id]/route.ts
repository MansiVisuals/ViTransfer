import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { deletePasskey, updatePasskeyName } from '@/lib/passkey'
import { invalidateAdminSessions, clearPasskeyChallenges } from '@/lib/session-invalidation'
export const runtime = 'nodejs'




/**
 * Delete PassKey
 *
 * DELETE /api/auth/passkey/[id]?userId=<optional>
 *
 * SECURITY:
 * - Requires admin authentication (JWT)
 * - If userId is provided, admin can delete that user's passkey (for support)
 * - If userId is not provided, deletes current user's passkey
 * - Ownership verified in deletePasskey function
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin authentication
    const user = await requireApiAdmin(request)
    if (user instanceof Response) return user

    const { id: credentialId } = await params

    if (!credentialId) {
      return NextResponse.json({ error: 'Credential ID required' }, { status: 400 })
    }

    // Get userId from query params (optional - defaults to current user)
    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId') || user.id

    // Delete passkey (ownership verified inside, but admin can override)
    const result = await deletePasskey(targetUserId, credentialId, true) // true = adminOverride

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to delete passkey' },
        { status: 400 }
      )
    }

    // Security: Invalidate all sessions when a passkey is deleted
    // This ensures if a passkey was compromised and is being removed,
    // any sessions authenticated with it are terminated
    await invalidateAdminSessions(targetUserId)
    await clearPasskeyChallenges(targetUserId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PASSKEY] Delete error:', error)

    return NextResponse.json({ error: 'Failed to delete passkey' }, { status: 500 })
  }
}

/**
 * Update PassKey Name
 *
 * PATCH /api/auth/passkey/[id]
 *
 * SECURITY:
 * - Requires admin authentication (JWT)
 * - Users can only update their own passkeys
 * - Ownership verified in updatePasskeyName function
 *
 * Body:
 * - name: string (new passkey name)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin authentication
    const user = await requireApiAdmin(request)
    if (user instanceof Response) return user

    const { id: credentialId } = await params

    if (!credentialId) {
      return NextResponse.json({ error: 'Credential ID required' }, { status: 400 })
    }

    // Parse request body
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Valid name required' },
        { status: 400 }
      )
    }

    // Limit name length
    if (name.length > 100) {
      return NextResponse.json(
        { error: 'Name too long (max 100 characters)' },
        { status: 400 }
      )
    }

    // Update passkey name (ownership verified inside)
    const result = await updatePasskeyName(user.id, credentialId, name.trim())

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to update passkey name' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PASSKEY] Update name error:', error)

    return NextResponse.json(
      { error: 'Failed to update passkey name' },
      { status: 500 }
    )
  }
}
