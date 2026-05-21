import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { deletePasskey, updatePasskeyName } from '@/lib/passkey'
import { invalidateAdminSessions, clearPasskeyChallenges } from '@/lib/session-invalidation'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'




export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const authMessages = messages?.auth || {}

  try {
    const user = await requireApiAdmin(request)
    if (user instanceof Response) return user

    const { id: credentialId } = await params

    if (!credentialId) {
      return NextResponse.json({ error: authMessages.credentialIdRequired || 'Credential ID required' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const targetUserId = searchParams.get('userId') || user.id

    const result = await deletePasskey(targetUserId, credentialId, true) // true = adminOverride

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || authMessages.failedToDeletePasskeyApi || 'Failed to delete passkey' },
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
    logError('[PASSKEY] Delete error:', error)

    return NextResponse.json({ error: authMessages.failedToDeletePasskeyApi || 'Failed to delete passkey' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const authMessages = messages?.auth || {}

  try {
    const user = await requireApiAdmin(request)
    if (user instanceof Response) return user

    const { id: credentialId } = await params

    if (!credentialId) {
      return NextResponse.json({ error: authMessages.credentialIdRequired || 'Credential ID required' }, { status: 400 })
    }

    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: authMessages.validPasskeyNameRequired || 'Valid name required' },
        { status: 400 }
      )
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: authMessages.passkeyNameTooLong || 'Name too long (max 100 characters)' },
        { status: 400 }
      )
    }

    // SECURITY: Sanitize name — only allow safe characters
    if (/[<>"'`&;{}]/.test(name)) {
      return NextResponse.json(
        { error: authMessages.passkeyNameInvalidCharacters || 'Name contains invalid characters' },
        { status: 400 }
      )
    }

    const result = await updatePasskeyName(user.id, credentialId, name.trim())

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || authMessages.failedToUpdatePasskeyName || 'Failed to update passkey name' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logError('[PASSKEY] Update name error:', error)

    return NextResponse.json(
      { error: authMessages.failedToUpdatePasskeyName || 'Failed to update passkey name' },
      { status: 500 }
    )
  }
}
