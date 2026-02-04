import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import {
  getPlaceholdersForType,
  replacePlaceholders,
  EMAIL_TEMPLATE_TYPES,
  type EmailTemplateType,
} from '@/lib/email-template-system'
import {
  renderEmailShell,
  renderEmailButton,
  getEmailBrand,
  escapeHtml,
  getEmailSettings,
  buildBrandingLogoUrl,
  type EmailHeaderStyle,
} from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/settings/email-templates/preview
 * Generate a preview of an email template with sample data
 */
export async function POST(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limit
  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 1000, maxRequests: 60, message: 'Too many preview requests. Please slow down.' },
    'email-template-preview'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()
    const { type, subject, bodyContent } = body

    // Validate template type
    if (!type || !Object.keys(EMAIL_TEMPLATE_TYPES).includes(type)) {
      return NextResponse.json(
        { error: 'Invalid template type' },
        { status: 400 }
      )
    }

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

    const templateType = type as EmailTemplateType

    // Get email settings for branding
    // Force refresh settings for preview to ensure we get latest accent color and logo
    const settings = await getEmailSettings(true)
    const companyName = settings.companyName || 'Your Company'
    const appDomain = settings.appDomain || 'https://example.com'
    const brand = getEmailBrand(settings.accentColor)
    const emailHeaderStyle = settings.emailHeaderStyle || 'LOGO_AND_NAME'
    // Add cache-busting timestamp for preview (browser caches aggressively)
    const baseLogoUrl = buildBrandingLogoUrl(settings)
    const brandingLogoUrl = `${baseLogoUrl}?ts=${Date.now()}`

    // Generate sample values for placeholders
    const sampleValues = generateSampleValues(templateType, companyName, appDomain)

    // Replace placeholders in subject and body
    const processedSubject = replacePlaceholders(subject, sampleValues)
    let processedBody = replacePlaceholders(bodyContent, sampleValues)

    // Process {{LOGO}} placeholder
    if (brandingLogoUrl) {
      const logoHtml = `<img src="${escapeHtml(brandingLogoUrl)}" alt="Logo" height="44" style="display:inline-block; border:0; outline:none; text-decoration:none; height:44px; width:auto; max-width:200px; vertical-align:middle;" />`
      processedBody = processedBody.replace(/\{\{LOGO\}\}/g, logoHtml)
    } else {
      processedBody = processedBody.replace(/\{\{LOGO\}\}/g, '')
    }

    // Process button syntax: {{BUTTON:Label:URL}}
    processedBody = processButtonSyntax(processedBody, brand)

    // Process CSS classes into inline styles
    processedBody = processEmailClasses(processedBody, brand)

    // Wrap in email shell
    const html = renderEmailShell({
      companyName,
      title: getEmailTitle(templateType),
      subtitle: getEmailSubtitle(templateType, sampleValues),
      bodyContent: processedBody,
      brand,
      brandingLogoUrl,
      emailHeaderStyle: emailHeaderStyle as EmailHeaderStyle,
    })

    return NextResponse.json({
      success: true,
      subject: processedSubject,
      html,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (error) {
    console.error('[API] Failed to generate email preview:', error)
    return NextResponse.json(
      { error: 'Failed to generate preview' },
      { status: 500 }
    )
  }
}

/**
 * Generate sample values for preview based on template type
 */
function generateSampleValues(
  type: EmailTemplateType,
  companyName: string,
  appDomain: string
): Record<string, string> {
  const base = {
    COMPANY_NAME: companyName,
    RECIPIENT_NAME: 'Jane Doe',
    APP_DOMAIN: appDomain,
  }

  const typeValues: Record<EmailTemplateType, Record<string, string>> = {
    NEW_VERSION: {
      ...base,
      PROJECT_TITLE: 'Summer Campaign 2026',
      VIDEO_NAME: 'Main Commercial',
      VERSION_LABEL: 'v2',
      SHARE_URL: `${appDomain}/share/abc123`,
      PASSWORD_NOTICE: '<div class="protected-note"><strong>Protected project:</strong> Use the password sent separately to access this project.</div>',
    },
    PROJECT_APPROVED: {
      ...base,
      PROJECT_TITLE: 'Summer Campaign 2026',
      VIDEO_NAME: 'Main Commercial',
      SHARE_URL: `${appDomain}/share/abc123`,
      APPROVAL_MESSAGE: `Great news! Your project <strong>Summer Campaign 2026</strong> has been approved. You can now download the final version without watermarks.`,
    },
    COMMENT_NOTIFICATION: {
      ...base,
      PROJECT_TITLE: 'Summer Campaign 2026',
      VIDEO_NAME: 'Main Commercial',
      VERSION_LABEL: 'v1',
      AUTHOR_NAME: 'John Smith',
      COMMENT_CONTENT: 'Great work on the intro! The pacing feels just right. One small note - could we try a slightly warmer color grade in the sunset scene around 0:45?',
      TIMECODE: 'at 00:00:45:12',
      SHARE_URL: `${appDomain}/share/abc123`,
    },
    ADMIN_COMMENT_NOTIFICATION: {
      ...base,
      CLIENT_NAME: 'Jane Doe',
      CLIENT_EMAIL: 'jane@example.com',
      PROJECT_TITLE: 'Summer Campaign 2026',
      VIDEO_NAME: 'Main Commercial',
      VERSION_LABEL: 'v1',
      COMMENT_CONTENT: 'This looks fantastic! Love the energy in the opening sequence. Just one minor revision - can we extend the logo hold at the end by 0.5 seconds?',
      TIMECODE: 'at 00:01:28:00',
      ADMIN_URL: `${appDomain}/admin`,
    },
    ADMIN_PROJECT_APPROVED: {
      ...base,
      CLIENT_NAME: 'Jane Doe',
      PROJECT_TITLE: 'Summer Campaign 2026',
      VIDEO_NAME: 'Main Commercial',
      APPROVAL_STATUS: 'Approved',
      ADMIN_URL: `${appDomain}/admin`,
    },
    PROJECT_GENERAL: {
      ...base,
      PROJECT_TITLE: 'Summer Campaign 2026',
      PROJECT_DESCRIPTION: 'Final deliverables for the summer marketing campaign including the main 30-second commercial and supporting assets.',
      SHARE_URL: `${appDomain}/share/abc123`,
      VIDEO_LIST: `
        <div style="font-size: 15px; padding: 6px 0;">• Main Commercial <span style="font-weight: 600;">v1</span></div>
        <div style="font-size: 15px; padding: 6px 0;">• B-Roll Package <span style="font-weight: 600;">v1</span></div>
        <div style="font-size: 15px; padding: 6px 0;">• Social Cutdowns <span style="font-weight: 600;">v1</span></div>
      `,
      PASSWORD_NOTICE: '<div class="protected-note"><strong>Protected project:</strong> Use the password sent separately to access this project.</div>',
    },
    PASSWORD: {
      ...base,
      PROJECT_TITLE: 'Summer Campaign 2026',
      PASSWORD: 'xK9mP2nL',
    },
    PASSWORD_RESET: {
      ...base,
      RESET_URL: `${appDomain}/reset-password?token=sample-reset-token`,
      EXPIRY_TIME: '30 minutes',
    },
  }

  return typeValues[type] || base
}

/**
 * Get email title based on template type
 */
function getEmailTitle(type: EmailTemplateType): string {
  const titles: Record<EmailTemplateType, string> = {
    NEW_VERSION: 'New Version Available',
    PROJECT_APPROVED: 'Project Approved',
    COMMENT_NOTIFICATION: 'New Comment',
    ADMIN_COMMENT_NOTIFICATION: 'New Client Feedback',
    ADMIN_PROJECT_APPROVED: 'Client Approved',
    PROJECT_GENERAL: 'Project Ready for Review',
    PASSWORD: 'Project Password',
    PASSWORD_RESET: 'Password Reset',
  }
  return titles[type] || 'Notification'
}

/**
 * Get email subtitle based on template type and values
 */
function getEmailSubtitle(type: EmailTemplateType, values: Record<string, string>): string {
  const projectTitle = values.PROJECT_TITLE || 'Your Project'

  const subtitles: Record<EmailTemplateType, string> = {
    NEW_VERSION: 'Ready for your review',
    PROJECT_APPROVED: 'Ready for download',
    COMMENT_NOTIFICATION: `New feedback on ${projectTitle}`,
    ADMIN_COMMENT_NOTIFICATION: `New comment on ${projectTitle}`,
    ADMIN_PROJECT_APPROVED: `${projectTitle}`,
    PROJECT_GENERAL: projectTitle,
    PASSWORD: projectTitle,
    PASSWORD_RESET: 'Reset your admin account password',
  }
  return subtitles[type] || ''
}

/**
 * Process button syntax {{BUTTON:Label:URL}} into actual HTML buttons
 */
function processButtonSyntax(content: string, brand: ReturnType<typeof getEmailBrand>): string {
  // Match {{BUTTON:Label:URL}} pattern
  const buttonRegex = /\{\{BUTTON:([^:}]+):([^}]+)\}\}/g

  return content.replace(buttonRegex, (_match, label, url) => {
    // The URL might contain placeholders that were already replaced
    return renderEmailButton({
      href: url.trim(),
      label: label.trim(),
      brand,
    })
  })
}

/**
 * Process CSS class shortcuts into inline styles for email compatibility
 */
function processEmailClasses(content: string, brand: ReturnType<typeof getEmailBrand>): string {
  let processed = content

  // Replace info-box class
  processed = processed.replace(
    /class="info-box"/g,
    `style="background: ${brand.accentSoftBg}; border: 1px solid ${brand.accentSoftBorder}; border-radius: 10px; padding: 16px; margin-bottom: 24px;"`
  )

  // Replace secondary-box class
  processed = processed.replace(
    /class="secondary-box"/g,
    `style="background: ${brand.surfaceAlt}; border: 1px solid ${brand.border}; border-radius: 10px; padding: 16px; margin-bottom: 24px;"`
  )

  // Replace info-label class
  processed = processed.replace(
    /class="info-label"/g,
    `style="font-size: 12px; font-weight: 700; color: ${brand.accent}; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.12em;"`
  )

  // Replace accent-text class
  processed = processed.replace(
    /class="accent-text"/g,
    `style="color: ${brand.accent}; font-weight: 600;"`
  )

  return processed
}
