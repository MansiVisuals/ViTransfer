import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { deletePasskey, updatePasskeyName } from '@/lib/passkey'
export const runtime = 'nodejs'




/**
 * Delete PassKey
 *
 * DELETE /api/auth/passkey/[id]
 *
 * SECURITY:
 * - Requires admin authentication (JWT)
 * - Users can only delete their own passkeys
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

    // Delete passkey (ownership verified inside)
    const result = await deletePasskey(user.id, credentialId)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to delete passkey' },
        { status: 400 }
      )
    }

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
