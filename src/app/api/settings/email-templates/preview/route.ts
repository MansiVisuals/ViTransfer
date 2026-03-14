import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import {
  replacePlaceholders,
  EMAIL_TEMPLATE_TYPES,
  type EmailTemplateType,
} from '@/lib/email-template-system'
import {
  renderEmailShell,
  getEmailBrand,
  escapeHtml,
  getEmailSettings,
  buildBrandingLogoUrl,
  processButtonSyntax,
  processEmailClasses,
  renderTimecodePill,
  type EmailHeaderStyle,
} from '@/lib/email'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'


export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/settings/email-templates/preview
 * Generate a preview of an email template with sample data
 */
export async function POST(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const settingsMessages = messages?.settings || {}
  const emailTemplateMessages = settingsMessages.emailTemplates || {}

  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // Rate limit
  const rateLimitResult = await rateLimit(
    request,
    { windowMs: 60 * 1000, maxRequests: 60, message: emailTemplateMessages.tooManyPreviewRequests || 'Too many preview requests. Please slow down.' },
    'email-template-preview'
  )
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()
    const { type, subject, bodyContent } = body

    // Validate template type
    if (!type || !Object.keys(EMAIL_TEMPLATE_TYPES).includes(type)) {
      return NextResponse.json(
        { error: emailTemplateMessages.invalidTemplateType || 'Invalid template type' },
        { status: 400 }
      )
    }

    if (!subject || typeof subject !== 'string') {
      return NextResponse.json(
        { error: emailTemplateMessages.subjectRequired || 'Subject is required' },
        { status: 400 }
      )
    }

    if (!bodyContent || typeof bodyContent !== 'string') {
      return NextResponse.json(
        { error: emailTemplateMessages.bodyContentRequired || 'Body content is required' },
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

    // Get localized preview messages
    const previewMessages = emailTemplateMessages || {}
    const emailCommonMessages = messages?.email?.common || {}

    // Generate sample values for placeholders
    const sampleValues = generateSampleValues(templateType, companyName, appDomain, brand, previewMessages, emailCommonMessages)

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
      title: getEmailTitle(templateType, previewMessages),
      subtitle: getEmailSubtitle(templateType, sampleValues, previewMessages),
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
    logError('[API] Failed to generate email preview:', error)
    return NextResponse.json(
      { error: emailTemplateMessages.failedToGeneratePreview || 'Failed to generate preview' },
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
  appDomain: string,
  brand: ReturnType<typeof getEmailBrand>,
  messages?: Record<string, any>,
  emailCommon?: Record<string, any>
): Record<string, string> {
  const ex = messages?.placeholderExamples || {}
  const recipientName = ex.RECIPIENT_NAME || 'Jane Doe'
  const projectTitle = ex.PROJECT_TITLE || 'Summer Campaign 2026'
  const videoName = ex.VIDEO_NAME || 'Main Commercial'
  const clientName = ex.CLIENT_NAME || 'Jane Doe'
  const authorName = ex.AUTHOR_NAME || 'John Smith'
  const approvalStatus = ex.APPROVAL_STATUS || 'Approved'
  const approvalAction = ex.APPROVAL_ACTION || 'approved'
  const projectDescription = ex.PROJECT_DESCRIPTION || 'Final deliverables for the summer marketing campaign.'
  const commentContent = ex.COMMENT_CONTENT || 'Great work on the intro!'
  const expiryTime = ex.EXPIRY_TIME || '30 minutes'
  const dueDate = ex.DUE_DATE || 'March 15, 2026'
  const reminderType = ex.REMINDER_TYPE || 'tomorrow'
  const approvalMessage = ex.APPROVAL_MESSAGE || `All deliverables for ${projectTitle} have been approved. The final files are now ready for download.`

  const base = {
    COMPANY_NAME: companyName,
    RECIPIENT_NAME: recipientName,
    APP_DOMAIN: appDomain,
  }

  // Generate sample timecode pills with deep-links
  const encodedVideo = encodeURIComponent(videoName)
  const sampleTcPill1 = renderTimecodePill('00:00:45:12', `${appDomain}/share/abc123?video=${encodedVideo}&t=45`, brand)
  const sampleTcPill2 = renderTimecodePill('00:01:28:00', `${appDomain}/share/abc123?video=${encodedVideo}&t=88`, brand)

  // Localized protected project notice
  const protectedNotice = emailCommon?.protectedProjectNotice || 'Use the password sent separately to access this project.'
  const protectedLabel = emailCommon?.protectedProject || 'Protected project:'

  const typeValues: Record<EmailTemplateType, Record<string, string>> = {
    NEW_VERSION: {
      ...base,
      PROJECT_TITLE: projectTitle,
      VIDEO_NAME: videoName,
      VERSION_LABEL: ex.VERSION_LABEL || 'v2',
      SHARE_URL: `${appDomain}/share/abc123`,
      PASSWORD_NOTICE: `<div class="protected-note"><strong>${protectedLabel}</strong> ${protectedNotice}</div>`,
      UNSUBSCRIBE_SECTION: '',
    },
    PROJECT_APPROVED: {
      ...base,
      PROJECT_TITLE: projectTitle,
      VIDEO_NAME: videoName,
      SHARE_URL: `${appDomain}/share/abc123`,
      APPROVAL_MESSAGE: `<strong>${clientName}</strong> ${approvalMessage}`,
      UNSUBSCRIBE_SECTION: '',
    },
    COMMENT_NOTIFICATION: {
      ...base,
      PROJECT_TITLE: projectTitle,
      VIDEO_NAME: videoName,
      VERSION_LABEL: 'v1',
      AUTHOR_NAME: authorName,
      COMMENT_CONTENT: commentContent,
      TIMECODE: sampleTcPill1,
      SHARE_URL: `${appDomain}/share/abc123`,
      UNSUBSCRIBE_SECTION: '',
    },
    ADMIN_COMMENT_NOTIFICATION: {
      ...base,
      CLIENT_NAME: clientName,
      CLIENT_EMAIL: ex.CLIENT_EMAIL || 'jane@example.com',
      PROJECT_TITLE: projectTitle,
      VIDEO_NAME: videoName,
      VERSION_LABEL: 'v1',
      COMMENT_CONTENT: commentContent,
      TIMECODE: sampleTcPill2,
      ADMIN_URL: `${appDomain}/admin`,
    },
    ADMIN_PROJECT_APPROVED: {
      ...base,
      CLIENT_NAME: clientName,
      PROJECT_TITLE: projectTitle,
      VIDEO_NAME: videoName,
      APPROVAL_STATUS: approvalStatus,
      APPROVAL_ACTION: approvalAction,
      ADMIN_URL: `${appDomain}/admin`,
    },
    PROJECT_GENERAL: {
      ...base,
      PROJECT_TITLE: projectTitle,
      PROJECT_DESCRIPTION: projectDescription,
      SHARE_URL: `${appDomain}/share/abc123`,
      VIDEO_LIST: `
        <div style="font-size: 15px; padding: 6px 0;">• ${videoName} <span style="font-weight: 600;">v1</span></div>
        <div style="font-size: 15px; padding: 6px 0;">• B-Roll <span style="font-weight: 600;">v1</span></div>
        <div style="font-size: 15px; padding: 6px 0;">• Social Media <span style="font-weight: 600;">v1</span></div>
      `,
      PASSWORD_NOTICE: `<div class="protected-note"><strong>${protectedLabel}</strong> ${protectedNotice}</div>`,
      UNSUBSCRIBE_SECTION: '',
    },
    PASSWORD: {
      ...base,
      PROJECT_TITLE: projectTitle,
      PASSWORD: ex.PASSWORD || 'xK9mP2nL',
      UNSUBSCRIBE_SECTION: '',
    },
    PASSWORD_RESET: {
      ...base,
      RESET_URL: `${appDomain}/reset-password?token=sample-reset-token`,
      EXPIRY_TIME: expiryTime,
    },
    DUE_DATE_REMINDER: {
      ...base,
      PROJECT_TITLE: projectTitle,
      DUE_DATE: dueDate,
      REMINDER_TYPE: reminderType,
      ADMIN_URL: `${appDomain}/admin`,
    },
    OTP_VERIFICATION: {
      ...base,
      PROJECT_TITLE: projectTitle,
      OTP_CODE: '123456',
      EXPIRY_MINUTES: '10',
      UNSUBSCRIBE_SECTION: '',
    },
    CLIENT_ACTIVITY_SUMMARY: {
      ...base,
      PROJECT_TITLE: projectTitle,
      SUMMARY_TEXT: '3 new comments, 1 approval',
      PERIOD: 'today',
      SUMMARY_ITEMS: '<div class="secondary-box"><div style="font-size:14px;">• Main Commercial v2 — New comment</div></div>',
      SHARE_URL: `${appDomain}/share/abc123`,
      UNSUBSCRIBE_SECTION: '',
    },
    ADMIN_ACTIVITY_SUMMARY: {
      ...base,
      SUMMARY_TEXT: '12 comments across 3 projects',
      PERIOD: 'today',
      SUMMARY_PROJECTS: '<div class="secondary-box"><div style="font-size:14px;">Summer Campaign 2026 — 5 comments</div></div>',
      ADMIN_URL: `${appDomain}/admin/projects`,
    },
  }

  return typeValues[type] || base
}

/**
 * Get email title based on template type
 */
function getEmailTitle(type: EmailTemplateType, messages?: Record<string, any>): string {
  const localizedTitles = messages?.previewTitles || {}

  const defaultTitles: Record<EmailTemplateType, string> = {
    NEW_VERSION: 'New Version Available',
    PROJECT_APPROVED: 'Project Approved',
    COMMENT_NOTIFICATION: 'New Comment',
    ADMIN_COMMENT_NOTIFICATION: 'New Comment',
    ADMIN_PROJECT_APPROVED: 'Client Approved',
    PROJECT_GENERAL: 'Ready for Review',
    PASSWORD: 'Project Password',
    PASSWORD_RESET: 'Password Reset',
    DUE_DATE_REMINDER: 'Deadline Reminder',
    OTP_VERIFICATION: 'Verification Code',
    CLIENT_ACTIVITY_SUMMARY: 'Project Update',
    ADMIN_ACTIVITY_SUMMARY: 'Client Activity Summary',
  }
  return localizedTitles[type] || defaultTitles[type] || 'Notification'
}

/**
 * Get email subtitle based on template type and values
 */
function getEmailSubtitle(type: EmailTemplateType, values: Record<string, string>, messages?: Record<string, any>): string {
  const projectTitle = values.PROJECT_TITLE || 'Sample Project'
  const videoName = values.VIDEO_NAME || 'Main Commercial'
  const clientName = values.CLIENT_NAME || 'Jane Doe'
  const localizedSubtitles = messages?.previewSubtitles || {}

  const subtitles: Record<EmailTemplateType, string> = {
    NEW_VERSION: localizedSubtitles.NEW_VERSION || 'Ready for your review',
    PROJECT_APPROVED: localizedSubtitles.PROJECT_APPROVED || 'Ready for download',
    COMMENT_NOTIFICATION: `${videoName} in ${projectTitle}`,
    ADMIN_COMMENT_NOTIFICATION: `${clientName} on ${videoName} in ${projectTitle}`,
    ADMIN_PROJECT_APPROVED: `${projectTitle}`,
    PROJECT_GENERAL: projectTitle,
    PASSWORD: projectTitle,
    PASSWORD_RESET: localizedSubtitles.PASSWORD_RESET || 'Reset your admin account password',
    DUE_DATE_REMINDER: `${projectTitle} ${localizedSubtitles.DUE_DATE_REMINDER_SUFFIX || 'is due tomorrow'}`,
    OTP_VERIFICATION: `${projectTitle}`,
    CLIENT_ACTIVITY_SUMMARY: `${projectTitle}`,
    ADMIN_ACTIVITY_SUMMARY: localizedSubtitles.ADMIN_ACTIVITY_SUMMARY || 'Latest updates',
  }
  return subtitles[type] || ''
}
