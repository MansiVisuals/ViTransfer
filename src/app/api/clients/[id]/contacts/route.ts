import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { sanitizeText } from '@/lib/security/html-sanitization'
import { safeParseBody } from '@/lib/validation'
import { SUPPORTED_LOCALES } from '@/i18n/locale'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'


interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/clients/[id]/contacts - List contacts for a company
export async function GET(request: NextRequest, { params }: RouteParams) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const clientContactMessages = messages?.clientContacts || {}
  const clientsMessages = messages?.clients || {}

  // 1. AUTHENTICATION
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // 2. RATE LIMITING
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: clientContactMessages.tooManyRequests || 'Too many requests. Please slow down.'
  }, 'clients-contacts-list')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const { id } = await params

    const contacts = await prisma.clientContact.findMany({
      where: { companyId: id },
      orderBy: { name: 'asc' }
    })

    return NextResponse.json({ contacts })
  } catch (error) {
    logError('Failed to fetch contacts:', error)
    return NextResponse.json({ error: clientContactMessages.failedToFetchContacts || 'Failed to fetch contacts' }, { status: 500 })
  }
}

// POST /api/clients/[id]/contacts - Add a contact to a company
export async function POST(request: NextRequest, { params }: RouteParams) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const clientContactMessages = messages?.clientContacts || {}
  const clientsMessages = messages?.clients || {}

  // 1. AUTHENTICATION
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // 2. RATE LIMITING
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: clientContactMessages.tooManyRequests || 'Too many requests. Please slow down.'
  }, 'clients-contacts-create')
  if (rateLimitResult) return rateLimitResult

  // 3. BUSINESS LOGIC
  try {
    const { id } = await params
    const parsed = await safeParseBody(request)
    if (!parsed.success) return parsed.response
    const { name, email, language } = parsed.data

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: clientContactMessages.contactNameRequired || 'Contact name is required' }, { status: 400 })
    }

    const sanitizedName = sanitizeText(name)

    // Validate AFTER sanitization — XSS payloads may sanitize to empty string
    if (sanitizedName.length === 0) {
      return NextResponse.json({ error: clientContactMessages.contactNameRequired || 'Contact name is required' }, { status: 400 })
    }

    // Verify company exists
    const company = await prisma.clientCompany.findUnique({
      where: { id }
    })

    if (!company) {
      return NextResponse.json({ error: clientsMessages.clientCompanyNotFound || 'Client company not found' }, { status: 404 })
    }

    const trimmedEmail = email?.trim() || null

    // Validate email format if provided
    if (trimmedEmail && !trimmedEmail.includes('@')) {
      return NextResponse.json({ error: clientContactMessages.invalidEmailFormat || 'Invalid email format' }, { status: 400 })
    }

    // Validate language if provided
    const contactLanguage = language?.trim() || null
    if (contactLanguage && !(SUPPORTED_LOCALES as readonly string[]).includes(contactLanguage)) {
      return NextResponse.json({ error: clientContactMessages.unsupportedLanguage || 'Unsupported language' }, { status: 400 })
    }

    const contact = await prisma.clientContact.create({
      data: {
        companyId: id,
        name: sanitizedName,
        email: trimmedEmail,
        language: contactLanguage,
      }
    })

    return NextResponse.json({ contact }, { status: 201 })
  } catch (error) {
    logError('Failed to create contact:', error)
    return NextResponse.json({ error: clientContactMessages.failedToCreateContact || 'Failed to create contact' }, { status: 500 })
  }
}
