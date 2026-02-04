import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import {
  getEmailTemplate,
  saveEmailTemplate,
  resetEmailTemplate,
  getPlaceholdersForType,
  getDefaultTemplate,
  TEMPLATE_METADATA,
  EMAIL_TEMPLATE_TYPES,
  type EmailTemplateType,
} from '@/lib/email-template-system'

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

  // Rate limit
  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 1000, maxRequests: 60, message: 'Too many requests. Please slow down.' },
    'email-template-get'
  )
  if (rateLimitResult) return rateLimitResult

  const { type } = await params

  // Validate template type
  if (!Object.keys(EMAIL_TEMPLATE_TYPES).includes(type)) {
    return NextResponse.json(
      { error: 'Invalid template type' },
      { status: 400 }
    )
  }

  const templateType = type as EmailTemplateType

  try {
    const template = await getEmailTemplate(templateType)
    const metadata = TEMPLATE_METADATA.find(m => m.type === templateType)
    const defaultTemplate = getDefaultTemplate(templateType)
    const placeholders = getPlaceholdersForType(templateType)

    return NextResponse.json({
      type: templateType,
      name: metadata?.name || templateType,
      description: metadata?.description || '',
      category: metadata?.category || 'client',
      subject: template.subject,
      bodyContent: template.bodyContent,
      isCustom: template.isCustom,
      placeholders,
      defaultSubject: defaultTemplate?.subject || '',
      defaultBodyContent: defaultTemplate?.bodyContent || '',
    })
  } catch (error) {
    console.error('[API] Failed to get email template:', error)
    return NextResponse.json(
      { error: 'Failed to load email template' },
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

  // Rate limit
  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 1000, maxRequests: 30, message: 'Too many updates. Please slow down.' },
    'email-template-update'
  )
  if (rateLimitResult) return rateLimitResult

  const { type } = await params

  // Validate template type
  if (!Object.keys(EMAIL_TEMPLATE_TYPES).includes(type)) {
    return NextResponse.json(
      { error: 'Invalid template type' },
      { status: 400 }
    )
  }

  const templateType = type as EmailTemplateType

  try {
    const body = await request.json()
    const { subject, bodyContent } = body

    if (!subject || typeof subject !== 'string') {
      return NextResponse.json(
        { error: 'Subject is required' },
        { status: 400 }
      )
    }

    if (!bodyContent || typeof bodyContent !== 'string') {
      return NextResponse.json(
        { error: 'Body content is required' },
        { status: 400 }
      )
    }

    // Basic validation - subject shouldn't be too long
    if (subject.length > 200) {
      return NextResponse.json(
        { error: 'Subject is too long (max 200 characters)' },
        { status: 400 }
      )
    }

    // Body content shouldn't be too large
    if (bodyContent.length > 50000) {
      return NextResponse.json(
        { error: 'Body content is too large (max 50KB)' },
        { status: 400 }
      )
    }

    await saveEmailTemplate(templateType, subject.trim(), bodyContent)

    return NextResponse.json({
      success: true,
      message: 'Template saved successfully',
    })
  } catch (error) {
    console.error('[API] Failed to save email template:', error)
    return NextResponse.json(
      { error: 'Failed to save email template' },
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

  // Rate limit
  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 1000, maxRequests: 30, message: 'Too many requests. Please slow down.' },
    'email-template-reset'
  )
  if (rateLimitResult) return rateLimitResult

  const { type } = await params

  // Validate template type
  if (!Object.keys(EMAIL_TEMPLATE_TYPES).includes(type)) {
    return NextResponse.json(
      { error: 'Invalid template type' },
      { status: 400 }
    )
  }

  const templateType = type as EmailTemplateType

  try {
    await resetEmailTemplate(templateType)

    // Get the default template to return
    const defaultTemplate = getDefaultTemplate(templateType)

    return NextResponse.json({
      success: true,
      message: 'Template reset to default',
      subject: defaultTemplate?.subject || '',
      bodyContent: defaultTemplate?.bodyContent || '',
    })
  } catch (error) {
    console.error('[API] Failed to reset email template:', error)
    return NextResponse.json(
      { error: 'Failed to reset email template' },
      { status: 500 }
    )
  }
}
