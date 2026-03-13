import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { updateRecipient, deleteRecipient } from '@/lib/recipients'
import { invalidateSessionsByEmail } from '@/lib/session-invalidation'
import { rateLimit } from '@/lib/rate-limit'
import { prisma } from '@/lib/db'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { z } from 'zod'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'




const updateRecipientSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().email('INVALID_EMAIL_FORMAT').nullable().optional(),
  isPrimary: z.boolean().optional(),
  receiveNotifications: z.boolean().optional()
}).refine(data => {
  // If email is provided (not null or undefined), validate it
  if (data.email !== null && data.email !== undefined && data.email !== '') {
    return data.email.includes('@')
  }
  return true
}, {
  message: 'INVALID_EMAIL_FORMAT'
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rid: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const recipientMessages = messages?.recipients || {}
  const projectMessages = messages?.projects || {}

  // 1. Authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // 2. Rate limiting: 30 requests per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: projectMessages.tooManyRequestsGeneric || 'Too many requests. Please slow down.'
  }, 'recipient-update')
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { rid: recipientId } = await params
    const body = await request.json()

    // Validate input
    const validation = updateRecipientSchema.safeParse(body)
    if (!validation.success) {
      const message = validation.error.errors[0].message
      const localizedError = message === 'INVALID_EMAIL_FORMAT'
        ? (recipientMessages.invalidEmail || 'Please enter a valid email address')
        : message

      return NextResponse.json(
        { error: localizedError },
        { status: 400 }
      )
    }

    // Get current recipient to check if email is changing
    const currentRecipient = await prisma.projectRecipient.findUnique({
      where: { id: recipientId },
      select: { email: true }
    })

    const recipient = await updateRecipient(recipientId, validation.data)

    // If email changed, invalidate sessions for the old email
    // This forces re-authentication with the new email
    if (validation.data.email !== undefined &&
        currentRecipient?.email &&
        currentRecipient.email !== validation.data.email) {
      await invalidateSessionsByEmail(currentRecipient.email)
    }

    return NextResponse.json({ recipient })
  } catch (error: any) {
    logError('Failed to update recipient:', error)

    if (error.message === 'Recipient not found') {
      return NextResponse.json(
        { error: recipientMessages.recipientNotFound || 'Recipient not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: recipientMessages.failedToUpdateRecipientApi || 'Failed to update recipient' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rid: string }> }
) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const recipientMessages = messages?.recipients || {}
  const projectMessages = messages?.projects || {}

  // 1. Authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // 2. Rate limiting: 20 requests per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: projectMessages.tooManyRequestsGeneric || 'Too many requests. Please slow down.'
  }, 'recipient-delete')
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { rid: recipientId } = await params

    // Get recipient email BEFORE deletion for session invalidation
    const recipientToDelete = await prisma.projectRecipient.findUnique({
      where: { id: recipientId },
      select: { email: true }
    })

    await deleteRecipient(recipientId)

    // Invalidate sessions for the deleted recipient's email
    if (recipientToDelete?.email) {
      await invalidateSessionsByEmail(recipientToDelete.email)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logError('Failed to delete recipient:', error)

    if (error.message === 'Recipient not found') {
      return NextResponse.json(
        { error: recipientMessages.recipientNotFound || 'Recipient not found' },
        { status: 404 }
      )
    }

    if (error.message === 'Cannot delete the last recipient') {
      return NextResponse.json(
        { error: recipientMessages.cannotDeleteLastRecipient || 'Cannot delete the last recipient. At least one recipient is required.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: recipientMessages.failedToDeleteRecipientApi || 'Failed to delete recipient' },
      { status: 500 }
    )
  }
}
