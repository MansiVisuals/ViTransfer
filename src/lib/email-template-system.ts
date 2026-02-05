/**
 * Customizable Email Template System
 *
 * Defines available email template types, their placeholders, and default content.
 * Templates support placeholders in the format {{PLACEHOLDER_NAME}} which are
 * replaced with actual values at send time.
 */

import { prisma } from './db'

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
    { key: '{{VIDEO_NAME}}', description: 'Name of the video', example: 'Main Video' },
    { key: '{{VERSION_LABEL}}', description: 'Version label (e.g., v1, v2)', example: 'v2' },
    { key: '{{SHARE_URL}}', description: 'Link to view the project', example: 'https://review.acme.com/share/abc123' },
    { key: '{{PASSWORD_NOTICE}}', description: 'Password protection notice (shown only if protected)', example: '' },
  ],
  PROJECT_APPROVED: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{VIDEO_NAME}}', description: 'Name of the approved video', example: 'Main Video' },
    { key: '{{SHARE_URL}}', description: 'Link to view/download the project', example: 'https://review.acme.com/share/abc123' },
    { key: '{{APPROVAL_MESSAGE}}', description: 'Dynamic approval message (includes who approved and download info)', example: 'All deliverables for Summer Campaign 2026 have been approved. The final files are now ready for download.' },
  ],
  COMMENT_NOTIFICATION: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{VIDEO_NAME}}', description: 'Name of the video', example: 'Main Video' },
    { key: '{{VERSION_LABEL}}', description: 'Version label', example: 'v1' },
    { key: '{{AUTHOR_NAME}}', description: 'Name of comment author', example: 'Jane Smith' },
    { key: '{{COMMENT_CONTENT}}', description: 'The comment text', example: 'Great work on the intro!' },
    { key: '{{TIMECODE}}', description: 'Timestamp of the comment (if any)', example: 'at 00:01:23:15' },
    { key: '{{SHARE_URL}}', description: 'Link to view and reply', example: 'https://review.acme.com/share/abc123' },
  ],
  ADMIN_COMMENT_NOTIFICATION: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{CLIENT_NAME}}', description: 'Name of the client who commented', example: 'John Doe' },
    { key: '{{CLIENT_EMAIL}}', description: 'Email of the client (if available)', example: 'john@example.com' },
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{VIDEO_NAME}}', description: 'Name of the video', example: 'Main Video' },
    { key: '{{VERSION_LABEL}}', description: 'Version label', example: 'v1' },
    { key: '{{COMMENT_CONTENT}}', description: 'The comment text', example: 'Could we adjust the color grading?' },
    { key: '{{TIMECODE}}', description: 'Timestamp of the comment (if any)', example: 'at 00:01:23:15' },
    { key: '{{ADMIN_URL}}', description: 'Link to admin panel', example: 'https://review.acme.com/admin' },
  ],
  ADMIN_PROJECT_APPROVED: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{CLIENT_NAME}}', description: 'Name of the client who approved', example: 'John Doe' },
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{VIDEO_NAME}}', description: 'Name of approved video (for partial approvals)', example: 'Main Video' },
    { key: '{{APPROVAL_STATUS}}', description: 'Full project or single video approval', example: 'Approved' },
    { key: '{{ADMIN_URL}}', description: 'Link to admin panel', example: 'https://review.acme.com/admin' },
  ],
  PROJECT_GENERAL: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{PROJECT_DESCRIPTION}}', description: 'Project description (if any)', example: 'Final deliverables for the summer campaign.' },
    { key: '{{SHARE_URL}}', description: 'Link to view the project', example: 'https://review.acme.com/share/abc123' },
    { key: '{{VIDEO_LIST}}', description: 'HTML list of ready videos', example: '' },
    { key: '{{PASSWORD_NOTICE}}', description: 'Password protection notice (shown only if protected)', example: '' },
  ],
  PASSWORD: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{PROJECT_TITLE}}', description: 'Title of the project', example: 'Summer Campaign 2026' },
    { key: '{{PASSWORD}}', description: 'The access password', example: 'xK9mP2nL' },
  ],
  PASSWORD_RESET: [
    ...COMMON_PLACEHOLDERS,
    { key: '{{RESET_URL}}', description: 'Password reset link', example: 'https://review.acme.com/reset-password?token=abc123' },
    { key: '{{EXPIRY_TIME}}', description: 'How long the link is valid', example: '30 minutes' },
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
    description: 'Sent to clients when a new video version is uploaded',
    category: 'client',
  },
  {
    type: 'PROJECT_APPROVED',
    name: 'Project/Video Approved',
    description: 'Sent to clients when their project or video is approved',
    category: 'client',
  },
  {
    type: 'COMMENT_NOTIFICATION',
    name: 'Comment Notification (to Client)',
    description: 'Sent to clients when admin leaves feedback on their video',
    category: 'client',
  },
  {
    type: 'ADMIN_COMMENT_NOTIFICATION',
    name: 'Comment Notification (to Admin)',
    description: 'Sent to admins when a client leaves feedback',
    category: 'admin',
  },
  {
    type: 'ADMIN_PROJECT_APPROVED',
    name: 'Approval Notification (to Admin)',
    description: 'Sent to admins when a client approves a project or video',
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
]

// Default template content
export interface DefaultTemplate {
  type: EmailTemplateType
  name: string
  description: string
  subject: string
  bodyContent: string
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    type: 'NEW_VERSION',
    name: 'New Version Notification',
    description: 'Sent to clients when a new video version is uploaded',
    subject: 'New Version Available: {{PROJECT_TITLE}}',
    bodyContent: `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
  Hi <strong>{{RECIPIENT_NAME}}</strong>,
</p>

<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  A new version is ready for your review.
</p>

<div class="secondary-box" style="text-align: center;">
  <div class="info-label">Project</div>
  <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">{{PROJECT_TITLE}}</div>
  <div class="info-label">Deliverables</div>
  <div style="font-size: 14px; line-height: 1.8;">{{VIDEO_NAME}} <span style="opacity: 0.7;">{{VERSION_LABEL}}</span></div>
</div>

{{PASSWORD_NOTICE}}

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:View Project:{{SHARE_URL}}}}
</div>

<p style="margin: 24px 0 0 0; font-size: 14px; text-align: center; line-height: 1.5;">
  Questions? Simply reply to this email.
</p>`,
  },
  {
    type: 'PROJECT_APPROVED',
    name: 'Project/Video Approved',
    description: 'Sent to clients when their project or video is approved',
    subject: '{{PROJECT_TITLE}} - Approved and Ready for Download',
    bodyContent: `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
  Hi <strong>{{RECIPIENT_NAME}}</strong>,
</p>

<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  {{APPROVAL_MESSAGE}}
</p>

<div class="secondary-box" style="text-align: center;">
  <div class="info-label">Project</div>
  <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">{{PROJECT_TITLE}}</div>
  <div class="info-label">Deliverables</div>
  <div style="font-size: 14px; line-height: 1.8;">{{VIDEO_NAME}}</div>
</div>

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:Download Files:{{SHARE_URL}}}}
</div>

<p style="margin: 24px 0 0 0; font-size: 14px; text-align: center; line-height: 1.5;">
  Questions? Simply reply to this email.
</p>`,
  },
  {
    type: 'COMMENT_NOTIFICATION',
    name: 'Comment Notification (to Client)',
    description: 'Sent to clients when admin leaves feedback on their video',
    subject: 'New Comment: {{PROJECT_TITLE}}',
    bodyContent: `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
  Hi <strong>{{RECIPIENT_NAME}}</strong>,
</p>

<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  We've reviewed the video and left some feedback for you.
</p>

<div class="secondary-box" style="text-align: center;">
  <div class="info-label">Project</div>
  <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">{{PROJECT_TITLE}}</div>
  <div class="info-label">Deliverables</div>
  <div style="font-size: 14px; line-height: 1.8;">{{VIDEO_NAME}} {{VERSION_LABEL}} {{TIMECODE}}</div>
</div>

<div class="info-box">
  <div class="info-label">Comment from {{AUTHOR_NAME}}</div>
  <div style="font-size: 15px; line-height: 1.6; white-space: pre-wrap;">{{COMMENT_CONTENT}}</div>
</div>

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:View and Reply:{{SHARE_URL}}}}
</div>

<p style="margin: 24px 0 0 0; font-size: 14px; text-align: center; line-height: 1.5;">
  Questions? Simply reply to this email.
</p>`,
  },
  {
    type: 'ADMIN_COMMENT_NOTIFICATION',
    name: 'Comment Notification (to Admin)',
    description: 'Sent to admins when a client leaves feedback',
    subject: 'Client Feedback: {{PROJECT_TITLE}}',
    bodyContent: `<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  <strong>{{CLIENT_NAME}}</strong> left feedback on a project.
</p>

<div class="secondary-box" style="text-align: center;">
  <div class="info-label">Client</div>
  <div style="font-size: 14px; margin-bottom: 12px;">{{CLIENT_NAME}}<br><span style="opacity: 0.7;">{{CLIENT_EMAIL}}</span></div>
  <div class="info-label">Project</div>
  <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">{{PROJECT_TITLE}}</div>
  <div class="info-label">Deliverables</div>
  <div style="font-size: 14px; line-height: 1.8;">{{VIDEO_NAME}} {{VERSION_LABEL}} {{TIMECODE}}</div>
</div>

<div class="info-box">
  <div class="info-label">Comment</div>
  <div style="font-size: 15px; line-height: 1.6; white-space: pre-wrap;">{{COMMENT_CONTENT}}</div>
</div>

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:View in Admin Panel:{{ADMIN_URL}}}}
</div>`,
  },
  {
    type: 'ADMIN_PROJECT_APPROVED',
    name: 'Approval Notification (to Admin)',
    description: 'Sent to admins when a client approves a project or video',
    subject: '{{CLIENT_NAME}} {{APPROVAL_STATUS}}: {{PROJECT_TITLE}}',
    bodyContent: `<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  <strong>{{CLIENT_NAME}}</strong> has approved the following deliverables.
</p>

<div class="secondary-box" style="text-align: center;">
  <div class="info-label">Project</div>
  <div style="font-size: 16px; font-weight: 700; margin-bottom: 12px;">{{PROJECT_TITLE}}</div>
  <div class="info-label">Deliverables</div>
  <div style="font-size: 14px; line-height: 1.8;">{{VIDEO_NAME}}</div>
</div>

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:View in Admin Panel:{{ADMIN_URL}}}}
</div>`,
  },
  {
    type: 'PROJECT_GENERAL',
    name: 'Ready for Review',
    description: 'Sent to clients when deliverables are ready for review',
    subject: 'Ready for Review: {{PROJECT_TITLE}}',
    bodyContent: `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
  Hi <strong>{{RECIPIENT_NAME}}</strong>,
</p>

<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  The deliverables are ready for your review.
</p>

<div class="secondary-box" style="text-align: center;">
  <div class="info-label">Project</div>
  <div style="font-size: 16px; font-weight: 700; margin-bottom: 6px;">{{PROJECT_TITLE}}</div>
  <div style="font-size: 14px; line-height: 1.6; margin-bottom: 12px;">{{PROJECT_DESCRIPTION}}</div>
  <div class="info-label">Deliverables</div>
  <div style="font-size: 14px; line-height: 1.8;">{{VIDEO_LIST}}</div>
</div>

{{PASSWORD_NOTICE}}

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:View Project:{{SHARE_URL}}}}
</div>

<p style="margin: 24px 0 0 0; font-size: 14px; text-align: center; line-height: 1.5;">
  Questions? Simply reply to this email.
</p>`,
  },
  {
    type: 'PASSWORD',
    name: 'Project Password',
    description: 'Sends the access password in a separate email for security',
    subject: 'Access Password: {{PROJECT_TITLE}}',
    bodyContent: `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
  Hi <strong>{{RECIPIENT_NAME}}</strong>,
</p>

<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  Use this password to access <strong>{{PROJECT_TITLE}}</strong>. We send it separately for security.
</p>

<div class="info-box" style="text-align: center;">
  <div class="info-label">Password</div>
  <div style="display: inline-block; padding: 12px 18px; border-radius: 10px; border: 1px dashed currentColor; font-family: 'SFMono-Regular', Menlo, Consolas, monospace; font-size: 18px; letter-spacing: 1px; word-break: break-all; background: #ffffff;">{{PASSWORD}}</div>
</div>

<p style="margin: 24px 0 0 0; font-size: 13px; text-align: center; line-height: 1.5;">
  Keep this password confidential. Pair it with the review link we sent separately.
</p>`,
  },
  {
    type: 'PASSWORD_RESET',
    name: 'Admin Password Reset',
    description: 'Sent to admins when they request a password reset',
    subject: 'Reset Your Password - {{COMPANY_NAME}}',
    bodyContent: `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
  Hi <strong>{{RECIPIENT_NAME}}</strong>,
</p>

<p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6;">
  We received a request to reset your password. Click the button below to create a new one.
</p>

<div style="margin: 28px 0; text-align: center;">
  {{BUTTON:Reset Password:{{RESET_URL}}}}
</div>

<div class="secondary-box">
  <div class="info-label">Security Notice</div>
  <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13px; line-height: 1.6;">
    <li>This link expires in <strong>{{EXPIRY_TIME}}</strong></li>
    <li>Can only be used once</li>
    <li>All sessions will be logged out after reset</li>
  </ul>
</div>

<p style="margin: 24px 0 0 0; font-size: 13px; text-align: center; line-height: 1.5;">
  If you didn't request this, you can safely ignore this email.
</p>`,
  },
]

/**
 * Get available placeholders for a template type
 */
export function getPlaceholdersForType(type: EmailTemplateType): PlaceholderDefinition[] {
  return TEMPLATE_PLACEHOLDERS[type] || COMMON_PLACEHOLDERS
}

/**
 * Get the default template for a type
 */
export function getDefaultTemplate(type: EmailTemplateType): DefaultTemplate | undefined {
  return DEFAULT_TEMPLATES.find(t => t.type === type)
}

/**
 * Extract all placeholders used in a template
 */
export function extractPlaceholders(content: string): string[] {
  const regex = /\{\{([A-Z_]+)\}\}/g
  const matches = new Set<string>()
  let match

  while ((match = regex.exec(content)) !== null) {
    matches.add(`{{${match[1]}}}`)
  }

  // Also match button syntax {{BUTTON:label:url}}
  const buttonRegex = /\{\{BUTTON:[^}]+\}\}/g
  while ((match = buttonRegex.exec(content)) !== null) {
    matches.add(match[0])
  }

  return Array.from(matches)
}

/**
 * Get template from database or return default
 */
export async function getEmailTemplate(type: EmailTemplateType): Promise<{
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

  // Return default template
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
 */
export async function getAllTemplates(): Promise<Array<{
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

  // Merge with metadata
  return TEMPLATE_METADATA.map(meta => {
    const custom = customMap.get(meta.type)
    const defaultTemplate = getDefaultTemplate(meta.type)

    return {
      type: meta.type,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      subject: custom?.subject || defaultTemplate?.subject || '',
      bodyContent: custom?.bodyContent || defaultTemplate?.bodyContent || '',
      isCustom: custom?.isCustom ?? false,
      enabled: custom?.enabled ?? true,
    }
  })
}
