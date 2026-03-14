/**
 * Customizable Email Template System
 *
 * Defines available email template types, their placeholders, and default content.
 * Templates support placeholders in the format {{PLACEHOLDER_NAME}} which are
 * replaced with actual values at send time.
 */

import { prisma } from './db'
import { loadLocaleMessages } from '@/i18n/locale'

function getEmailTemplateLocaleDefaults(messages: Record<string, any>) {
  const common = messages.common || {}

  return {
    common: {
      greeting: common.greeting || 'Hi <strong>{{RECIPIENT_NAME}}</strong>,',
      questionsFooter: common.questionsFooter || 'Questions? Simply reply to this email.',
      projectLabel: common.projectLabel || 'Project',
      deliverableLabel: common.deliverableLabel || 'Deliverable',
      deliverablesLabel: common.deliverablesLabel || 'Deliverables',
      passwordLabel: common.passwordLabel || 'Password',
      securityNoticeLabel: common.securityNoticeLabel || 'Security Notice',
      dueDateLabel: common.dueDateLabel || 'Due Date',
    },
    newVersion: messages.newVersion || {},
    projectApproved: messages.projectApproved || {},
    commentNotification: messages.commentNotification || {},
    adminCommentNotification: messages.adminCommentNotification || {},
    adminProjectApproved: messages.adminProjectApproved || {},
    projectGeneral: messages.projectGeneral || {},
    password: messages.password || {},
    passwordReset: messages.passwordReset || {},
    dueDateReminder: messages.dueDateReminder || {},
    otpVerification: messages.otpVerification || {},
    clientActivitySummary: messages.clientActivitySummary || {},
    adminActivitySummary: messages.adminActivitySummary || {},
  }
}

// Template type constants
export const EMAIL_TEMPLATE_TYPES = {
  NEW_VERSION: 'NEW_VERSION',
  PROJECT_APPROVED: 'PROJECT_APPROVED',
  COMMENT_NOTIFICATION: 'COMMENT_NOTIFICATION',
  ADMIN_COMMENT_NOTIFICATION: 'ADMIN_COMMENT_NOTIFICATION',
  ADMIN_PROJECT_APPROVED: 'ADMIN_PROJECT_APPROVED',
  PROJECT_GENERAL: 'PROJECT_GENERAL',
  PASSWORD: 'PASSWORD',
  PASSWORD_RESET: 'PASSWORD_RESET',
  DUE_DATE_REMINDER: 'DUE_DATE_REMINDER',
  OTP_VERIFICATION: 'OTP_VERIFICATION',
  CLIENT_ACTIVITY_SUMMARY: 'CLIENT_ACTIVITY_SUMMARY',
  ADMIN_ACTIVITY_SUMMARY: 'ADMIN_ACTIVITY_SUMMARY',
} as const

export type EmailTemplateType = keyof typeof EMAIL_TEMPLATE_TYPES

// Placeholder definitions with descriptions
export interface PlaceholderDefinition {
  key: string
  description: string
  example: string
}

// Common placeholders available in all templates
export const COMMON_PLACEHOLDERS: PlaceholderDefinition[] = [
  { key: '{{COMPANY_NAME}}', description: 'Your company name from settings', example: 'Acme Studios' },
  { key: '{{RECIPIENT_NAME}}', description: 'Name of the email recipient', example: 'John Doe' },
  { key: '{{APP_DOMAIN}}', description: 'Your application domain URL', example: 'https://review.acme.com' },
  { key: '{{LOGO}}', description: 'Your company logo image (can be placed anywhere in the email body)', example: '' },
]

// Template-specific placeholder definitions
export const TEMPLATE_PLACEHOLDERS: Record<EmailTemplateType, PlaceholderDefinition[]> = {
  NEW_VERSION: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{VIDEO_NAME}}', description: 'Name of the deliverable', example: 'Main Video' },
    { key: '{{VERSION_LABEL}}', description: 'Version label (e.g., v1, v2)', example: 'v2' },
    { key: '{{SHARE_URL}}', description: 'Link to view the project', example: 'https://review.acme.com/share/abc123' },
    { key: '{{PASSWORD_NOTICE}}', description: 'Password protection notice (shown only if protected)', example: '' },
    { key: '{{UNSUBSCRIBE_SECTION}}', description: 'Unsubscribe section HTML (optional)', example: '' },
  ],
  PROJECT_APPROVED: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{VIDEO_NAME}}', description: 'Name of the approved deliverable', example: 'Main Video' },
    { key: '{{SHARE_URL}}', description: 'Link to view/download the project', example: 'https://review.acme.com/share/abc123' },
    { key: '{{APPROVAL_MESSAGE}}', description: 'Dynamic approval message (includes who approved and download info)', example: 'All deliverables for Summer Campaign 2026 have been approved. The final files are now ready for download.' },
    { key: '{{UNSUBSCRIBE_SECTION}}', description: 'Unsubscribe section HTML (optional)', example: '' },
  ],
  COMMENT_NOTIFICATION: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{VIDEO_NAME}}', description: 'Name of the deliverable', example: 'Main Video' },
    { key: '{{VERSION_LABEL}}', description: 'Version label', example: 'v1' },
    { key: '{{AUTHOR_NAME}}', description: 'Name of comment author', example: 'Jane Smith' },
    { key: '{{COMMENT_CONTENT}}', description: 'The comment text', example: 'Great work on the intro!' },
    { key: '{{TIMECODE}}', description: 'Clickable timecode pill linking to the comment (if any)', example: '00:01:23:15' },
    { key: '{{ATTACHMENTS}}', description: 'List of attached files (shown only if files were uploaded)', example: '' },
    { key: '{{SHARE_URL}}', description: 'Link to view and reply', example: 'https://review.acme.com/share/abc123' },
    { key: '{{UNSUBSCRIBE_SECTION}}', description: 'Unsubscribe section HTML (optional)', example: '' },
  ],
  ADMIN_COMMENT_NOTIFICATION: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{CLIENT_NAME}}', description: 'Name of the client who commented', example: 'John Doe' },
    { key: '{{CLIENT_EMAIL}}', description: 'Email of the client (if available)', example: 'john@example.com' },
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{VIDEO_NAME}}', description: 'Name of the deliverable', example: 'Main Video' },
    { key: '{{VERSION_LABEL}}', description: 'Version label', example: 'v1' },
    { key: '{{COMMENT_CONTENT}}', description: 'The comment text', example: 'Could we adjust the color grading?' },
    { key: '{{TIMECODE}}', description: 'Clickable timecode pill linking to the comment (if any)', example: '00:01:23:15' },
    { key: '{{ATTACHMENTS}}', description: 'List of attached files (shown only if files were uploaded)', example: '' },
    { key: '{{ADMIN_URL}}', description: 'Link to admin panel', example: 'https://review.acme.com/admin' },
  ],
  ADMIN_PROJECT_APPROVED: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{CLIENT_NAME}}', description: 'Name of the client who approved', example: 'John Doe' },
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{VIDEO_NAME}}', description: 'Name of approved deliverable (for partial approvals)', example: 'Main Video' },
    { key: '{{APPROVAL_STATUS}}', description: 'Approval status (capitalized, for subject lines)', example: 'Approved' },
    { key: '{{APPROVAL_ACTION}}', description: 'Approval action (lowercase, for body text)', example: 'approved' },
    { key: '{{ADMIN_URL}}', description: 'Link to admin panel', example: 'https://review.acme.com/admin' },
  ],
  PROJECT_GENERAL: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{PROJECT_DESCRIPTION}}', description: 'Project description (if any)', example: 'Final deliverables for the summer campaign.' },
    { key: '{{SHARE_URL}}', description: 'Link to view the project', example: 'https://review.acme.com/share/abc123' },
    { key: '{{VIDEO_LIST}}', description: 'HTML list of ready deliverables', example: '' },
    { key: '{{PASSWORD_NOTICE}}', description: 'Password protection notice (shown only if protected)', example: '' },
    { key: '{{UNSUBSCRIBE_SECTION}}', description: 'Unsubscribe section HTML (optional)', example: '' },
  ],
  PASSWORD: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{PASSWORD}}', description: 'The access password', example: 'xK9mP2nL' },
    { key: '{{UNSUBSCRIBE_SECTION}}', description: 'Unsubscribe section HTML (optional)', example: '' },
  ],
  PASSWORD_RESET: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{RESET_URL}}', description: 'Password reset link', example: 'https://review.acme.com/reset-password?token=abc123' },
    { key: '{{EXPIRY_TIME}}', description: 'How long the link is valid', example: '30 minutes' },
  ],
  DUE_DATE_REMINDER: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{DUE_DATE}}', description: 'Formatted due date', example: 'March 15, 2026' },
    { key: '{{REMINDER_TYPE}}', description: 'When the project is due (e.g., tomorrow, in 7 days)', example: 'tomorrow' },
    { key: '{{ADMIN_URL}}', description: 'Link to admin panel', example: 'https://review.acme.com/admin' },
  ],
  OTP_VERIFICATION: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{OTP_CODE}}', description: 'One-time verification code', example: '123456' },
    { key: '{{EXPIRY_MINUTES}}', description: 'Code expiry in minutes', example: '10' },
    { key: '{{UNSUBSCRIBE_SECTION}}', description: 'Unsubscribe section HTML (optional)', example: '' },
  ],
  CLIENT_ACTIVITY_SUMMARY: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{SUMMARY_TEXT}}', description: 'Summary counts text', example: '3 new comments, 1 approval' },
    { key: '{{PERIOD}}', description: 'Schedule period text', example: 'today' },
    { key: '{{SUMMARY_ITEMS}}', description: 'Rendered summary items HTML', example: '' },
    { key: '{{SHARE_URL}}', description: 'Link to view project', example: 'https://review.acme.com/share/abc123' },
    { key: '{{UNSUBSCRIBE_SECTION}}', description: 'Unsubscribe section HTML (optional)', example: '' },
  ],
  ADMIN_ACTIVITY_SUMMARY: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{SUMMARY_TEXT}}', description: 'Summary counts text', example: '12 comments across 3 projects' },
    { key: '{{PERIOD}}', description: 'Schedule period text', example: 'today' },
    { key: '{{SUMMARY_PROJECTS}}', description: 'Rendered project summary HTML', example: '' },
    { key: '{{ADMIN_URL}}', description: 'Link to admin dashboard', example: 'https://review.acme.com/admin/projects' },
  ],
}

// Template metadata for UI display
export interface TemplateMetadata {
  type: EmailTemplateType
  name: string
  description: string
  category: 'client' | 'admin' | 'security'
}

export const TEMPLATE_METADATA: TemplateMetadata[] = [
  {
    type: 'NEW_VERSION',
    name: 'New Version Notification',
    description: 'Sent to clients when a new version is uploaded',
    category: 'client',
  },
  {
    type: 'PROJECT_APPROVED',
    name: 'Project/Deliverable Approved',
    description: 'Sent to clients when a project or deliverable is approved',
    category: 'client',
  },
  {
    type: 'COMMENT_NOTIFICATION',
    name: 'Comment Notification (to Client)',
    description: 'Sent to clients when admin leaves a comment on a project',
    category: 'client',
  },
  {
    type: 'ADMIN_COMMENT_NOTIFICATION',
    name: 'Comment Notification (to Admin)',
    description: 'Sent to admins when a client leaves a comment',
    category: 'admin',
  },
  {
    type: 'ADMIN_PROJECT_APPROVED',
    name: 'Approval Notification (to Admin)',
    description: 'Sent to admins when a client approves a project or deliverable',
    category: 'admin',
  },
  {
    type: 'PROJECT_GENERAL',
    name: 'Ready for Review',
    description: 'Sent to clients when deliverables are ready for review',
    category: 'client',
  },
  {
    type: 'PASSWORD',
    name: 'Project Password',
    description: 'Sends the access password in a separate email for security',
    category: 'client',
  },
  {
    type: 'PASSWORD_RESET',
    name: 'Admin Password Reset',
    description: 'Sent to admins when they request a password reset',
    category: 'security',
  },
  {
    type: 'DUE_DATE_REMINDER',
    name: 'Due Date Reminder',
    description: 'Sent to admins when a project deadline is approaching',
    category: 'admin',
  },
  {
    type: 'OTP_VERIFICATION',
    name: 'OTP Verification Code',
    description: 'Sent to recipients when OTP verification is required',
    category: 'security',
  },
  {
    type: 'CLIENT_ACTIVITY_SUMMARY',
    name: 'Client Activity Summary',
    description: 'Scheduled summary sent to client recipients',
    category: 'client',
  },
  {
    type: 'ADMIN_ACTIVITY_SUMMARY',
    name: 'Admin Activity Summary',
    description: 'Scheduled summary sent to admins',
    category: 'admin',
  },
]

// Default template content
export interface DefaultTemplate {
  type: EmailTemplateType
  name: string
  description: string
  subject: string
  bodyContent: string
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = TEMPLATE_METADATA
  .map(meta => buildLocalizedDefaultTemplate(meta.type, {}))
  .filter((template): template is DefaultTemplate => Boolean(template))

/**
 * Get available placeholders for a template type
 */
export function getPlaceholdersForType(type: EmailTemplateType): PlaceholderDefinition[] {
  return TEMPLATE_PLACEHOLDERS[type] || COMMON_PLACEHOLDERS
}

/**
 * Get available placeholders with localized descriptions
 */
export async function getLocalizedPlaceholdersForType(
  type: EmailTemplateType,
  locale?: string
): Promise<PlaceholderDefinition[]> {
  const placeholders = getPlaceholdersForType(type)
  if (!locale) return placeholders

  try {
    const messages = await loadLocaleMessages(locale)
    const descriptions = messages.settings?.emailTemplates?.placeholderDescriptions || {}
    const examples = messages.settings?.emailTemplates?.placeholderExamples || {}

    return placeholders.map(p => {
      // Extract key name from {{KEY}} format
      const keyName = p.key.replace(/^\{\{|\}\}$/g, '')
      return {
        ...p,
        description: descriptions[keyName] || p.description,
        example: examples[keyName] || p.example,
      }
    })
  } catch {
    return placeholders
  }
}

/**
 * Get the default template for a type
 */
export function getDefaultTemplate(type: EmailTemplateType): DefaultTemplate | undefined {
  return DEFAULT_TEMPLATES.find(t => t.type === type)
}

/**
 * Load email translation messages for a given locale.
 * Thin wrapper around loadLocaleMessages that extracts the `email` section.
 */
export async function loadEmailMessages(locale: string = 'en'): Promise<Record<string, any>> {
  const messages = await loadLocaleMessages(locale)
  return messages.email || {}
}

/**
 * Get localized template metadata (name + description) for a template type
 */
export async function getLocalizedTemplateMetadata(
  type: EmailTemplateType,
  locale?: string
): Promise<{ name: string; description: string }> {
  const meta = TEMPLATE_METADATA.find(m => m.type === type)
  const defaultName = meta?.name || type
  const defaultDescription = meta?.description || ''

  if (!locale) return { name: defaultName, description: defaultDescription }

  try {
    const messages = await loadLocaleMessages(locale)
    const settingsMessages = messages.settings?.emailTemplates || {}
    return {
      name: settingsMessages.templateNames?.[type] || defaultName,
      description: settingsMessages.templateDescriptions?.[type] || defaultDescription,
    }
  } catch {
    return { name: defaultName, description: defaultDescription }
  }
}

/**
 * Build a localized default template from email messages
 * Uses the same HTML structure as DEFAULT_TEMPLATES but with translated text
 */
export function buildLocalizedDefaultTemplate(
  type: EmailTemplateType,
  messages: Record<string, any>
): DefaultTemplate | undefined {
  const defaults = getEmailTemplateLocaleDefaults(messages)
  const { common } = defaults
  const greeting = common.greeting
  const questionsFooter = common.questionsFooter
  const projectLabel = common.projectLabel
  const deliverableLabel = common.deliverableLabel
  const deliverablesLabel = common.deliverablesLabel
  const passwordLabel = common.passwordLabel
  const securityNoticeLabel = common.securityNoticeLabel
  const dueDateLabel = common.dueDateLabel

  const meta = TEMPLATE_METADATA.find(m => m.type === type)
  if (!meta) return undefined

  switch (type) {
    case 'NEW_VERSION': {
      const t = defaults.newVersion
      return {
        type: 'NEW_VERSION',
        name: meta.name,
        description: meta.description,
        subject: t.subject || 'New Version Available: {{PROJECT_TITLE}}',
        bodyContent: `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
  ${greeting}
</p>

<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  ${t.body || 'A new version of {{VIDEO_NAME}} (<span class="accent-text">{{VERSION_LABEL}}</span>) is ready for your review in {{PROJECT_TITLE}}.'}
</p>

<div class="secondary-box" style="text-align: center;">
  <div class="info-label">${projectLabel}</div>
  <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">{{PROJECT_TITLE}}</div>
  <div class="info-label">${deliverableLabel}</div>
  <div style="font-size: 14px; line-height: 1.8;">{{VIDEO_NAME}} <span style="opacity: 0.7;">{{VERSION_LABEL}}</span></div>
</div>

{{PASSWORD_NOTICE}}

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:${t.button || 'View Project'}:{{SHARE_URL}}}}
</div>

<p style="margin: 24px 0 0 0; font-size: 13px; text-align: center; line-height: 1.5;">
  ${questionsFooter}
</p>

{{UNSUBSCRIBE_SECTION}}`,
      }
    }
    case 'PROJECT_APPROVED': {
      const t = defaults.projectApproved
      return {
        type: 'PROJECT_APPROVED',
        name: meta.name,
        description: meta.description,
        subject: t.subject || '{{PROJECT_TITLE}} - Approved and Ready for Download',
        bodyContent: `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
  ${greeting}
</p>

<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  {{APPROVAL_MESSAGE}}
</p>

<div class="secondary-box" style="text-align: center;">
  <div class="info-label">${projectLabel}</div>
  <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">{{PROJECT_TITLE}}</div>
  <div class="info-label">${deliverableLabel}</div>
  <div style="font-size: 14px; line-height: 1.8;">{{VIDEO_NAME}}</div>
</div>

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:${t.button || 'Download Files'}:{{SHARE_URL}}}}
</div>

<p style="margin: 24px 0 0 0; font-size: 13px; text-align: center; line-height: 1.5;">
  ${questionsFooter}
</p>

{{UNSUBSCRIBE_SECTION}}`,
      }
    }
    case 'COMMENT_NOTIFICATION': {
      const t = defaults.commentNotification
      return {
        type: 'COMMENT_NOTIFICATION',
        name: meta.name,
        description: meta.description,
        subject: t.subject || 'New Comment on {{PROJECT_TITLE}}',
        bodyContent: `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
  ${greeting}
</p>

<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  ${t.body || "There's a new comment on {{VIDEO_NAME}} {{VERSION_LABEL}} in {{PROJECT_TITLE}}."}
</p>

<div class="info-box">
  <div class="info-label">{{AUTHOR_NAME}} &nbsp;{{TIMECODE}}</div>
  <div style="font-size: 15px; line-height: 1.6; white-space: pre-wrap;">{{COMMENT_CONTENT}}</div>
</div>

{{ATTACHMENTS}}

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:${t.button || 'View Project'}:{{SHARE_URL}}}}
</div>

<p style="margin: 24px 0 0 0; font-size: 13px; text-align: center; line-height: 1.5;">
  ${questionsFooter}
</p>

{{UNSUBSCRIBE_SECTION}}`,
      }
    }
    case 'ADMIN_COMMENT_NOTIFICATION': {
      const t = defaults.adminCommentNotification
      return {
        type: 'ADMIN_COMMENT_NOTIFICATION',
        name: meta.name,
        description: meta.description,
        subject: t.subject || 'New Comment from {{CLIENT_NAME}}: {{PROJECT_TITLE}}',
        bodyContent: `<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  ${t.body || '<strong>{{CLIENT_NAME}}</strong> left a comment on {{VIDEO_NAME}} {{VERSION_LABEL}} in {{PROJECT_TITLE}}.'}
</p>

<div class="info-box">
  <div class="info-label">{{CLIENT_NAME}} &nbsp;{{TIMECODE}}</div>
  <div style="font-size: 15px; line-height: 1.6; white-space: pre-wrap;">{{COMMENT_CONTENT}}</div>
</div>

{{ATTACHMENTS}}

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:${t.button || 'View in Admin Panel'}:{{ADMIN_URL}}}}
</div>`,
      }
    }
    case 'ADMIN_PROJECT_APPROVED': {
      const t = defaults.adminProjectApproved
      return {
        type: 'ADMIN_PROJECT_APPROVED',
        name: meta.name,
        description: meta.description,
        subject: t.subject || '{{CLIENT_NAME}} {{APPROVAL_STATUS}}: {{PROJECT_TITLE}}',
        bodyContent: `<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  ${t.body || '<strong>{{CLIENT_NAME}}</strong> has {{APPROVAL_ACTION}} {{VIDEO_NAME}} in {{PROJECT_TITLE}}.'}
</p>

<div class="secondary-box" style="text-align: center;">
  <div class="info-label">${projectLabel}</div>
  <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">{{PROJECT_TITLE}}</div>
  <div class="info-label">${deliverableLabel}</div>
  <div style="font-size: 14px; line-height: 1.8;">{{VIDEO_NAME}}</div>
</div>

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:${t.button || 'View in Admin Panel'}:{{ADMIN_URL}}}}
</div>`,
      }
    }
    case 'PROJECT_GENERAL': {
      const t = defaults.projectGeneral
      return {
        type: 'PROJECT_GENERAL',
        name: meta.name,
        description: meta.description,
        subject: t.subject || 'Ready for Review: {{PROJECT_TITLE}}',
        bodyContent: `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
  ${greeting}
</p>

<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  ${t.body || '{{PROJECT_TITLE}} is ready for your review.'}
</p>

<div class="secondary-box" style="text-align: center;">
  <div class="info-label">${projectLabel}</div>
  <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">{{PROJECT_TITLE}}</div>
  <div style="font-size: 14px; line-height: 1.6; margin-bottom: 12px;">{{PROJECT_DESCRIPTION}}</div>
  <div class="info-label">${deliverablesLabel}</div>
  <div style="font-size: 14px; line-height: 1.8;">{{VIDEO_LIST}}</div>
</div>

{{PASSWORD_NOTICE}}

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:${t.button || 'View Project'}:{{SHARE_URL}}}}
</div>

<p style="margin: 24px 0 0 0; font-size: 13px; text-align: center; line-height: 1.5;">
  ${questionsFooter}
</p>

{{UNSUBSCRIBE_SECTION}}`,
      }
    }
    case 'PASSWORD': {
      const t = defaults.password
      return {
        type: 'PASSWORD',
        name: meta.name,
        description: meta.description,
        subject: t.subject || 'Access Password: {{PROJECT_TITLE}}',
        bodyContent: `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
  ${greeting}
</p>

<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  ${t.body || 'Use this password to access <strong>{{PROJECT_TITLE}}</strong>. We send it separately for security.'}
</p>

<div class="info-box" style="text-align: center;">
  <div class="info-label">${passwordLabel}</div>
  <div style="display: inline-block; padding: 12px 18px; border-radius: 10px; border: 1px dashed currentColor; font-family: 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 18px; letter-spacing: 1px; word-break: break-all; background: #ffffff;">{{PASSWORD}}</div>
</div>

<p style="margin: 24px 0 0 0; font-size: 13px; text-align: center; line-height: 1.5;">
  ${t.keepConfidential || 'Keep this password confidential. Pair it with the review link we sent separately.'}
</p>

{{UNSUBSCRIBE_SECTION}}`,
      }
    }
    case 'PASSWORD_RESET': {
      const t = defaults.passwordReset
      return {
        type: 'PASSWORD_RESET',
        name: meta.name,
        description: meta.description,
        subject: t.subject || 'Reset Your Password - {{COMPANY_NAME}}',
        bodyContent: `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
  ${greeting}
</p>

<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  ${t.body || 'We received a request to reset your password. Click the button below to create a new one.'}
</p>

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:${t.button || 'Reset Password'}:{{RESET_URL}}}}
</div>

<div class="secondary-box">
  <div class="info-label">${securityNoticeLabel}</div>
  <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13px; line-height: 1.6;">
    <li>${t.expiresIn || 'This link expires in <strong>{{EXPIRY_TIME}}</strong>'}</li>
    <li>${t.singleUse || 'Can only be used once'}</li>
    <li>${t.sessionsLogout || 'All sessions will be logged out after reset'}</li>
  </ul>
</div>

<p style="margin: 24px 0 0 0; font-size: 13px; text-align: center; line-height: 1.5;">
  ${t.ignoreNotice || "If you didn't request this, you can safely ignore this email."}
</p>`,
      }
    }
    case 'DUE_DATE_REMINDER': {
      const t = defaults.dueDateReminder
      return {
        type: 'DUE_DATE_REMINDER',
        name: meta.name,
        description: meta.description,
        subject: t.subject || 'Deadline Reminder: {{PROJECT_TITLE}} due {{REMINDER_TYPE}}',
        bodyContent: `<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  ${t.body || '<strong>{{PROJECT_TITLE}}</strong> is due <strong>{{REMINDER_TYPE}}</strong>.'}
</p>

<div class="secondary-box" style="text-align: center;">
  <div class="info-label">${projectLabel}</div>
  <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">{{PROJECT_TITLE}}</div>
  <div class="info-label">${dueDateLabel}</div>
  <div style="font-size: 14px; line-height: 1.8;">{{DUE_DATE}}</div>
</div>

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:${t.button || 'View in Admin Panel'}:{{ADMIN_URL}}}}
</div>`,
      }
    }
    case 'OTP_VERIFICATION': {
      const t = defaults.otpVerification
      return {
        type: 'OTP_VERIFICATION',
        name: meta.name,
        description: meta.description,
        subject: t.subject || 'Your verification code for {{PROJECT_TITLE}}',
        bodyContent: `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
  ${greeting}
</p>

<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  ${t.body || 'Use this verification code to access <strong>{{PROJECT_TITLE}}</strong>:'}
</p>

<div class="secondary-box" style="text-align: center;">
  <div class="info-label">${t.codeLabel || 'Verification Code'}</div>
  <div style="font-size: 34px; font-weight: 800; letter-spacing: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;">{{OTP_CODE}}</div>
</div>

<p style="margin: 0 0 10px 0; font-size: 14px; line-height: 1.5;">
  ${t.expiry || 'This code expires in {{EXPIRY_MINUTES}} minutes.'}
</p>

<p style="margin: 0 0 18px 0; font-size: 13px; line-height: 1.5;">
  ${t.ignoreNotice || "If you didn't request this code, you can safely ignore this email."}
</p>

{{UNSUBSCRIBE_SECTION}}`,
      }
    }
    case 'CLIENT_ACTIVITY_SUMMARY': {
      const t = defaults.clientActivitySummary
      return {
        type: 'CLIENT_ACTIVITY_SUMMARY',
        name: meta.name,
        description: meta.description,
        subject: t.subject || 'Updates on {{PROJECT_TITLE}}',
        bodyContent: `<p style="margin:0 0 20px; font-size:16px; line-height:1.5;">
  ${greeting}
</p>

<p style="margin:0 0 20px; font-size:15px; line-height:1.6;">
  ${t.body || "Here's an update on <strong>{{PROJECT_TITLE}}</strong>."}
</p>

<div class="secondary-box">
  <div class="info-label">${t.summaryLabel || 'Summary'}</div>
  <div style="font-size:14px; line-height:1.7;">{{SUMMARY_TEXT}} {{PERIOD}}</div>
</div>

{{SUMMARY_ITEMS}}

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:${t.button || 'View Project'}:{{SHARE_URL}}}}
</div>

{{UNSUBSCRIBE_SECTION}}`,
      }
    }
    case 'ADMIN_ACTIVITY_SUMMARY': {
      const t = defaults.adminActivitySummary
      return {
        type: 'ADMIN_ACTIVITY_SUMMARY',
        name: meta.name,
        description: meta.description,
        subject: t.subject || 'Project activity summary ({{SUMMARY_TEXT}})',
        bodyContent: `<p style="margin:0 0 20px; font-size:16px; line-height:1.5;">
  ${greeting}
</p>

<p style="margin:0 0 20px; font-size:15px; line-height:1.6;">
  ${t.body || 'Here is the latest client activity ({{SUMMARY_TEXT}} {{PERIOD}}).'}
</p>

{{SUMMARY_PROJECTS}}

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:${t.button || 'Open Admin Dashboard'}:{{ADMIN_URL}}}}
</div>`,
      }
    }
    default:
      return undefined
  }
}

/**
 * Get template from database or return default
 */
export async function getEmailTemplate(type: EmailTemplateType, locale?: string): Promise<{
  subject: string
  bodyContent: string
  isCustom: boolean
}> {
  try {
    const template = await (prisma as any).emailTemplate?.findUnique({
      where: { type },
      select: { subject: true, bodyContent: true, isCustom: true, enabled: true },
    })

    if (template && template.enabled) {
      return {
        subject: template.subject,
        bodyContent: template.bodyContent,
        isCustom: template.isCustom,
      }
    }
  } catch {
    // Fall back to default if database error
  }

  // Return localized default template if locale provided
  if (locale) {
    const allMessages = await loadLocaleMessages(locale)
    const messages = allMessages.email || {}
    const localizedTemplate = buildLocalizedDefaultTemplate(type, messages)
    if (localizedTemplate) {
      return {
        subject: localizedTemplate.subject,
        bodyContent: localizedTemplate.bodyContent,
        isCustom: false,
      }
    }
  }

  // Fallback to hardcoded English default
  const defaultTemplate = getDefaultTemplate(type)
  if (!defaultTemplate) {
    throw new Error(`No default template found for type: ${type}`)
  }

  return {
    subject: defaultTemplate.subject,
    bodyContent: defaultTemplate.bodyContent,
    isCustom: false,
  }
}

/**
 * Replace placeholders in template content
 */
export function replacePlaceholders(
  content: string,
  values: Record<string, string>
): string {
  let result = content

  // Replace standard placeholders
  for (const [key, value] of Object.entries(values)) {
    const placeholder = key.startsWith('{{') ? key : `{{${key}}}`
    result = result.replace(new RegExp(escapeRegex(placeholder), 'g'), value)
  }

  return result
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Save or update a custom template
 */
export async function saveEmailTemplate(
  type: EmailTemplateType,
  subject: string,
  bodyContent: string
): Promise<void> {
  const metadata = TEMPLATE_METADATA.find(t => t.type === type)

  await (prisma as any).emailTemplate?.upsert({
    where: { type },
    create: {
      type,
      name: metadata?.name || type,
      description: metadata?.description || null,
      subject,
      bodyContent,
      isCustom: true,
      enabled: true,
    },
    update: {
      subject,
      bodyContent,
      isCustom: true,
      enabled: true,
      updatedAt: new Date(),
    },
  })
}

/**
 * Reset template to default
 */
export async function resetEmailTemplate(type: EmailTemplateType): Promise<void> {
  await (prisma as any).emailTemplate?.deleteMany({
    where: { type },
  })
}

/**
 * Enable or disable a template override
 * When disabled, template resolution falls back to default content
 */
export async function setEmailTemplateEnabled(
  type: EmailTemplateType,
  enabled: boolean
): Promise<void> {
  await (prisma as any).emailTemplate?.upsert({
    where: { type },
    create: {
      type,
      name: TEMPLATE_METADATA.find(t => t.type === type)?.name || type,
      description: TEMPLATE_METADATA.find(t => t.type === type)?.description || null,
      subject: getDefaultTemplate(type)?.subject || '',
      bodyContent: getDefaultTemplate(type)?.bodyContent || '',
      isCustom: false,
      enabled,
    },
    update: {
      enabled,
      updatedAt: new Date(),
    },
  })
}

// Type for database template record (matches Prisma model)
interface DbEmailTemplate {
  id: string
  type: string
  name: string
  description: string | null
  subject: string
  bodyContent: string
  isCustom: boolean
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Get all templates with their current status
 * When locale is provided, template names, descriptions, and default content are localized
 */
export async function getAllTemplates(locale?: string): Promise<Array<{
  type: EmailTemplateType
  name: string
  description: string
  category: 'client' | 'admin' | 'security'
  subject: string
  bodyContent: string
  isCustom: boolean
  enabled: boolean
}>> {
  // Get all custom templates from database
  const customTemplates: DbEmailTemplate[] = await (prisma as any).emailTemplate?.findMany() || []
  const customMap = new Map<string, DbEmailTemplate>(customTemplates.map(t => [t.type, t]))

  // Load locale messages for template names/descriptions and default content
  let settingsMessages: Record<string, any> = {}
  let emailMessages: Record<string, any> = {}
  if (locale) {
    try {
      const messages = await loadLocaleMessages(locale)
      settingsMessages = messages.settings?.emailTemplates || {}
      emailMessages = messages.email || {}
    } catch {
      // Fall back to English
    }
  }

  const templateNames = settingsMessages.templateNames || {}
  const templateDescriptions = settingsMessages.templateDescriptions || {}

  // Merge with metadata
  return TEMPLATE_METADATA.map(meta => {
    const custom = customMap.get(meta.type)

    // For default (non-custom) content, use localized template if locale provided
    let subject = ''
    let bodyContent = ''

    if (custom) {
      subject = custom.subject
      bodyContent = custom.bodyContent
    } else if (locale && Object.keys(emailMessages).length > 0) {
      const localizedTemplate = buildLocalizedDefaultTemplate(meta.type, emailMessages)
      subject = localizedTemplate?.subject || ''
      bodyContent = localizedTemplate?.bodyContent || ''
    }

    if (!subject || !bodyContent) {
      const defaultTemplate = getDefaultTemplate(meta.type)
      subject = subject || defaultTemplate?.subject || ''
      bodyContent = bodyContent || defaultTemplate?.bodyContent || ''
    }

    return {
      type: meta.type,
      name: templateNames[meta.type] || meta.name,
      description: templateDescriptions[meta.type] || meta.description,
      category: meta.category,
      subject,
      bodyContent,
      isCustom: custom?.isCustom ?? false,
      enabled: custom?.enabled ?? true,
    }
  })
}
