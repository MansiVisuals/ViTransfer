import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import {
  getAllTemplates,
  getPlaceholdersForType,
  TEMPLATE_METADATA,
} from '@/lib/email-template-system'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/settings/email-templates
 * List all email templates with their current customization status
 */
export async function GET(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limit
  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 1000, maxRequests: 60, message: 'Too many requests. Please slow down.' },
    'email-templates-list'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    const templates = await getAllTemplates()

    // Include placeholder definitions for each template
    const templatesWithPlaceholders = templates.map(template => ({
      ...template,
      placeholders: getPlaceholdersForType(template.type),
    }))

    return NextResponse.json({
      templates: templatesWithPlaceholders,
      metadata: TEMPLATE_METADATA,
    })
  } catch (error) {
    console.error('[API] Failed to list email templates:', error)
    return NextResponse.json(
      { error: 'Failed to load email templates' },
      { status: 500 }
    )
  }
}
