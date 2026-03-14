import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import {
  getEmailTemplate,
  saveEmailTemplate,
  resetEmailTemplate,
  setEmailTemplateEnabled,
  getLocalizedPlaceholdersForType,
  getDefaultTemplate,
  buildLocalizedDefaultTemplate,
  loadEmailMessages,
  getLocalizedTemplateMetadata,
  TEMPLATE_METADATA,
  EMAIL_TEMPLATE_TYPES,
  type EmailTemplateType,
} from '@/lib/email-template-system'
import { prisma } from '@/lib/db'
import { loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'


export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ type: string }>
}

/**
 * GET /api/settings/email-templates/[type]
 * Get a specific email template by type
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const { type } = await params

  const settings = await prisma.settings.findFirst({ select: { language: true } })
  const locale = settings?.language || 'en'
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const templateMessages = messages?.settings?.emailTemplates

  // Rate limit
  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 1000, maxRequests: 60, message: templateMessages?.tooManyRequestsSlowDown || 'Too many requests. Please slow down.' },
    'email-template-get'
  )
  if (rateLimitResult) return rateLimitResult

  // Validate template type
  if (!Object.keys(EMAIL_TEMPLATE_TYPES).includes(type)) {
    return NextResponse.json(
      { error: templateMessages?.invalidTemplateType || 'Invalid template type' },
      { status: 400 }
    )
  }

  const templateType = type as EmailTemplateType

  try {
    // Get the configured language for localized display
    const template = await getEmailTemplate(templateType, locale)
    const metadata = TEMPLATE_METADATA.find(m => m.type === templateType)
    const placeholders = await getLocalizedPlaceholdersForType(templateType, locale)

    // Get localized template name and description
    const localizedMeta = await getLocalizedTemplateMetadata(templateType, locale)

    // Get localized default content
    let defaultSubject = ''
    let defaultBodyContent = ''

    if (locale !== 'en') {
      const emailMessages = await loadEmailMessages(locale)
      const localizedDefault = buildLocalizedDefaultTemplate(templateType, emailMessages)
      if (localizedDefault) {
        defaultSubject = localizedDefault.subject
        defaultBodyContent = localizedDefault.bodyContent
      }
    }

    if (!defaultSubject || !defaultBodyContent) {
      const defaultTemplate = getDefaultTemplate(templateType)
      defaultSubject = defaultSubject || defaultTemplate?.subject || ''
      defaultBodyContent = defaultBodyContent || defaultTemplate?.bodyContent || ''
    }

    return NextResponse.json({
      type: templateType,
      name: localizedMeta.name,
      description: localizedMeta.description,
      category: metadata?.category || 'client',
      subject: template.subject,
      bodyContent: template.bodyContent,
      isCustom: template.isCustom,
      placeholders,
      defaultSubject,
      defaultBodyContent,
    })
  } catch (error) {
    logError('[API] Failed to get email template:', error)
    return NextResponse.json(
      { error: templateMessages?.failedToLoad || 'Failed to load email template' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/settings/email-templates/[type]
 * Update a specific email template
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const { type } = await params
  const settings = await prisma.settings.findFirst({ select: { language: true } })
  const locale = settings?.language || 'en'
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const templateMessages = messages?.settings?.emailTemplates

  // Rate limit
  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 1000, maxRequests: 30, message: templateMessages?.tooManyUpdatesSlowDown || 'Too many updates. Please slow down.' },
    'email-template-update'
  )
  if (rateLimitResult) return rateLimitResult

  // Validate template type
  if (!Object.keys(EMAIL_TEMPLATE_TYPES).includes(type)) {
    return NextResponse.json(
      { error: templateMessages?.invalidTemplateType || 'Invalid template type' },
      { status: 400 }
    )
  }

  const templateType = type as EmailTemplateType

  try {
    const body = await request.json()
    const { subject, bodyContent } = body

    if (!subject || typeof subject !== 'string') {
      return NextResponse.json(
        { error: templateMessages?.subjectRequired || 'Subject is required' },
        { status: 400 }
      )
    }

    if (!bodyContent || typeof bodyContent !== 'string') {
      return NextResponse.json(
        { error: templateMessages?.bodyContentRequired || 'Body content is required' },
        { status: 400 }
      )
    }

    // Basic validation - subject shouldn't be too long
    if (subject.length > 200) {
      return NextResponse.json(
        { error: templateMessages?.subjectTooLong || 'Subject is too long (max 200 characters)' },
        { status: 400 }
      )
    }

    // Body content shouldn't be too large
    if (bodyContent.length > 50000) {
      return NextResponse.json(
        { error: templateMessages?.bodyContentTooLarge || 'Body content is too large (max 50KB)' },
        { status: 400 }
      )
    }

    await saveEmailTemplate(templateType, subject.trim(), bodyContent)

    return NextResponse.json({
      success: true,
      message: templateMessages?.templateSavedSuccessfully || 'Template saved successfully',
    })
  } catch (error) {
    logError('[API] Failed to save email template:', error)
    return NextResponse.json(
      { error: templateMessages?.failedToSaveTemplate || 'Failed to save email template' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/settings/email-templates/[type]
 * Reset a template to its default content
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const { type } = await params
  const settings = await prisma.settings.findFirst({ select: { language: true } })
  const locale = settings?.language || 'en'
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const templateMessages = messages?.settings?.emailTemplates

  // Rate limit
  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 1000, maxRequests: 30, message: templateMessages?.tooManyRequestsSlowDown || 'Too many requests. Please slow down.' },
    'email-template-reset'
  )
  if (rateLimitResult) return rateLimitResult

  // Validate template type
  if (!Object.keys(EMAIL_TEMPLATE_TYPES).includes(type)) {
    return NextResponse.json(
      { error: templateMessages?.invalidTemplateType || 'Invalid template type' },
      { status: 400 }
    )
  }

  const templateType = type as EmailTemplateType

  try {
    await resetEmailTemplate(templateType)

    // Get the configured language to return localized defaults
    // Try localized default first
    let subject = ''
    let bodyContent = ''

    if (locale !== 'en') {
      const emailMessages = await loadEmailMessages(locale)
      const localizedTemplate = buildLocalizedDefaultTemplate(templateType, emailMessages)
      if (localizedTemplate) {
        subject = localizedTemplate.subject
        bodyContent = localizedTemplate.bodyContent
      }
    }

    if (!subject || !bodyContent) {
      const defaultTemplate = getDefaultTemplate(templateType)
      subject = subject || defaultTemplate?.subject || ''
      bodyContent = bodyContent || defaultTemplate?.bodyContent || ''
    }

    return NextResponse.json({
      success: true,
      message: templateMessages?.templateResetToDefault || 'Template reset to default',
      subject,
      bodyContent,
    })
  } catch (error) {
    logError('[API] Failed to reset email template:', error)
    return NextResponse.json(
      { error: templateMessages?.failedToResetTemplate || 'Failed to reset email template' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/settings/email-templates/[type]
 * Enable or disable a specific template override
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const { type } = await params
  const settings = await prisma.settings.findFirst({ select: { language: true } })
  const locale = settings?.language || 'en'
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const templateMessages = messages?.settings?.emailTemplates

  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 1000, maxRequests: 30, message: templateMessages?.tooManyUpdatesSlowDown || 'Too many updates. Please slow down.' },
    'email-template-enable-toggle'
  )
  if (rateLimitResult) return rateLimitResult

  if (!Object.keys(EMAIL_TEMPLATE_TYPES).includes(type)) {
    return NextResponse.json(
      { error: templateMessages?.invalidTemplateType || 'Invalid template type' },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    const { enabled } = body

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: templateMessages?.invalidEnabledValue || 'Enabled must be a boolean' },
        { status: 400 }
      )
    }

    const templateType = type as EmailTemplateType
    await setEmailTemplateEnabled(templateType, enabled)

    return NextResponse.json({
      success: true,
      enabled,
      message: enabled
        ? (templateMessages?.templateEnabled || 'Template enabled')
        : (templateMessages?.templateDisabled || 'Template disabled'),
    })
  } catch (error) {
    logError('[API] Failed to toggle email template enabled state:', error)
    return NextResponse.json(
      { error: templateMessages?.failedToUpdateTemplateStatus || 'Failed to update template status' },
      { status: 500 }
    )
  }
}
