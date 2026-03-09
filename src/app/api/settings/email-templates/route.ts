import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import {
  getAllTemplates,
  getLocalizedPlaceholdersForType,
  TEMPLATE_METADATA,
} from '@/lib/email-template-system'
import { prisma } from '@/lib/db'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/settings/email-templates
 * List all email templates with their current customization status
 */
export async function GET(request: NextRequest) {
  const configuredLocale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(configuredLocale).catch(() => null)
  const templateMessages = messages?.settings?.emailTemplates || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limit
  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 1000, maxRequests: 60, message: templateMessages.tooManyRequestsSlowDown || 'Too many requests. Please slow down.' },
    'email-templates-list'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    // Get the configured language for localized template display
    const settings = await prisma.settings.findFirst({ select: { language: true } })
    const locale = settings?.language || 'en'

    const templates = await getAllTemplates(locale)

    // Include localized placeholder definitions for each template
    const templatesWithPlaceholders = await Promise.all(
      templates.map(async template => ({
        ...template,
        placeholders: await getLocalizedPlaceholdersForType(template.type, locale),
      }))
    )

    return NextResponse.json({
      templates: templatesWithPlaceholders,
      metadata: TEMPLATE_METADATA,
    })
  } catch (error) {
    console.error('[API] Failed to list email templates:', error)
    return NextResponse.json(
      { error: templateMessages.failedToLoad || 'Failed to load email templates' },
      { status: 500 }
    )
  }
}
