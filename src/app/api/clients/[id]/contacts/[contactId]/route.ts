import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeText } from '@/lib/security/html-sanitization'
import { safeParseBody } from '@/lib/validation'
import { SUPPORTED_LOCALES, getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'


interface RouteParams {
  params: Promise<{ id: string; contactId: string }>
}

// PATCH /api/clients/[id]/contacts/[contactId] - Update a contact
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  // 1. AUTHENTICATION
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const contactMessages = messages?.clientContacts

  // 2. RATE LIMITING
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: contactMessages?.tooManyRequests || 'Too many requests. Please slow down.'
  }, 'clients-contacts-update')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const { id, contactId } = await params
    const parsed = await safeParseBody(request)
    if (!parsed.success) return parsed.response
    const { name, email, language } = parsed.data

    // Verify contact exists and belongs to this company
    const existingContact = await prisma.clientContact.findFirst({
      where: {
        id: contactId,
        companyId: id
      }
    })

    if (!existingContact) {
      return NextResponse.json({ error: contactMessages?.contactNotFound || 'Contact not found' }, { status: 404 })
    }

    const updateData: { name?: string; email?: string | null; language?: string | null } = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: contactMessages?.contactNameRequired || 'Contact name is required' }, { status: 400 })
      }
      const sanitizedName = sanitizeText(name)
      if (sanitizedName.length === 0) {
        return NextResponse.json({ error: contactMessages?.contactNameRequired || 'Contact name is required' }, { status: 400 })
      }
      updateData.name = sanitizedName
    }

    if (email !== undefined) {
      const trimmedEmail = email?.trim() || null
      if (trimmedEmail && !trimmedEmail.includes('@')) {
        return NextResponse.json({ error: contactMessages?.invalidEmailFormat || 'Invalid email format' }, { status: 400 })
      }
      updateData.email = trimmedEmail
    }

    if (language !== undefined) {
      const contactLanguage = language?.trim() || null
      if (contactLanguage && !SUPPORTED_LOCALES.includes(contactLanguage as any)) {
        return NextResponse.json({ error: contactMessages?.unsupportedLanguage || 'Unsupported language' }, { status: 400 })
      }
      updateData.language = contactLanguage
    }

    const contact = await prisma.clientContact.update({
      where: { id: contactId },
      data: updateData
    })

    return NextResponse.json({ contact })
  } catch (error) {
    logError('Failed to update contact:', error)
    return NextResponse.json({ error: contactMessages?.failedToUpdateContact || 'Failed to update contact' }, { status: 500 })
  }
}

// DELETE /api/clients/[id]/contacts/[contactId] - Delete a contact
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  // 1. AUTHENTICATION
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const contactMessages = messages?.clientContacts

  // 2. RATE LIMITING
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: contactMessages?.tooManyRequests || 'Too many requests. Please slow down.'
  }, 'clients-contacts-delete')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const { id, contactId } = await params

    // Verify contact exists and belongs to this company
    const existingContact = await prisma.clientContact.findFirst({
      where: {
        id: contactId,
        companyId: id
      }
    })

    if (!existingContact) {
      return NextResponse.json({ error: contactMessages?.contactNotFound || 'Contact not found' }, { status: 404 })
    }

    await prisma.clientContact.delete({
      where: { id: contactId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logError('Failed to delete contact:', error)
    return NextResponse.json({ error: contactMessages?.failedToDeleteContact || 'Failed to delete contact' }, { status: 500 })
  }
}
