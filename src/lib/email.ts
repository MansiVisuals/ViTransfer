import nodemailer from 'nodemailer'
import { prisma } from './db'
import { decrypt } from './encryption'

export const EMAIL_BRAND = {
  accent: '#007AFF',
  accentGradient: 'linear-gradient(135deg, #0A84FF 0%, #007AFF 100%)',
  accentSoftBg: '#eff6ff',
  accentSoftBorder: '#bfdbfe',
  surface: '#ffffff',
  surfaceAlt: '#f9fafb',
  border: '#e5e7eb',
  text: '#111827',
  textSubtle: '#374151',
  muted: '#6b7280',
} as const

export function renderEmailButton({
  href,
  label,
  variant = 'primary',
  align = 'center',
}: {
  href: string
  label: string
  variant?: 'primary' | 'secondary'
  align?: 'left' | 'center' | 'right'
}): string {
  const backgroundColor = variant === 'primary' ? EMAIL_BRAND.accent : EMAIL_BRAND.surfaceAlt
  const textColor = variant === 'primary' ? '#ffffff' : EMAIL_BRAND.textSubtle
  const borderStyle = variant === 'primary' ? 'none' : `1px solid ${EMAIL_BRAND.border}`
  const shadowStyle = variant === 'primary' ? '0 4px 12px rgba(0,122,255,0.25)' : 'none'

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${align}">
      <tr>
        <td bgcolor="${backgroundColor}" style="border-radius: 10px; border: ${borderStyle}; box-shadow: ${shadowStyle}; mso-padding-alt: 12px 22px;">
          <a href="${escapeHtml(href)}" style="display: inline-block; padding: 12px 22px; color: ${textColor}; text-decoration: none; font-size: 15px; font-weight: 650; line-height: 1; border-radius: 10px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `.trim()
}

export function renderUnsubscribeSection(unsubscribeUrl: string): string {
  return `
    <div style="margin: 28px 0 0; padding-top: 18px; border-top: 1px solid ${EMAIL_BRAND.border}; text-align: center;">
      ${renderEmailButton({ href: unsubscribeUrl, label: 'Unsubscribe', variant: 'secondary' })}
      <p style="margin: 10px 0 0; font-size: 12px; color: ${EMAIL_BRAND.muted}; line-height: 1.5;">
        Stops email updates only. Your access link still works.
      </p>
    </div>
  `.trim()
}

/**
 * Escape HTML to prevent XSS and email injection
 */
export function escapeHtml(unsafe: string): string {
  if (!unsafe) return ''
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/**
 * Sanitize string for email header use (defense-in-depth)
 * Removes CRLF and other header injection attempts
 */
function sanitizeEmailHeader(value: string): string {
  if (!value) return ''
  return value
    .replace(/[\r\n]/g, '') // Remove CRLF
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim()
}

export interface EmailShellOptions {
  companyName: string
  title: string
  subtitle?: string
  bodyContent: string
  footerNote?: string
  preheader?: string
}

export function renderEmailShell({
  companyName,
  title,
  subtitle,
  bodyContent,
  footerNote,
  preheader,
}: EmailShellOptions) {
  const safePreheader = preheader ? escapeHtml(preheader) : ''

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6;">
  ${preheader ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; mso-hide:all;">${safePreheader}</div>` : ''}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f6; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width: 600px; max-width: 600px; border-collapse: separate; background: ${EMAIL_BRAND.surface}; border: 1px solid ${EMAIL_BRAND.border}; border-radius: 12px; overflow: hidden;">
          <tr>
            <td style="background: ${EMAIL_BRAND.accentGradient}; padding: 30px 24px; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
              <div style="font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.9); margin-bottom: 10px; font-weight: 700;">${escapeHtml(companyName)}</div>
              <div style="font-size: 24px; font-weight: 750; color: #ffffff; margin-bottom: 8px;">${escapeHtml(title)}</div>
              ${subtitle ? `<div style="font-size: 15px; color: rgba(255,255,255,0.95); line-height: 1.4;">${escapeHtml(subtitle)}</div>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: ${EMAIL_BRAND.textSubtle}; font-size: 15px; line-height: 1.6;">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="background: ${EMAIL_BRAND.surfaceAlt}; padding: 18px 24px; border-top: 1px solid ${EMAIL_BRAND.border}; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
              <div style="font-size: 12px; color: ${EMAIL_BRAND.muted}; line-height: 1.5;">
                ${escapeHtml(footerNote || companyName)}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `
}

interface EmailSettings {
  smtpServer: string | null
  smtpPort: number | null
  smtpUsername: string | null
  smtpPassword: string | null
  smtpFromAddress: string | null
  smtpSecure: string | null
  appDomain: string | null
  companyName: string | null
}

let cachedSettings: EmailSettings | null = null
let settingsCacheTime: number = 0
const CACHE_DURATION = 30 * 1000 // 30 seconds (reduced for testing)

/**
 * Get email settings from database with caching
 */
export async function getEmailSettings(): Promise<EmailSettings> {
  const now = Date.now()
  
  // Return cached settings if still valid
  if (cachedSettings && (now - settingsCacheTime) < CACHE_DURATION) {
    return cachedSettings
  }

  // Fetch fresh settings
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
    select: {
      smtpServer: true,
      smtpPort: true,
      smtpUsername: true,
      smtpPassword: true,
      smtpFromAddress: true,
      smtpSecure: true,
      appDomain: true,
      companyName: true,
    }
  })

  // Decrypt the password if it exists
  cachedSettings = settings ? {
    ...settings,
    smtpPassword: settings.smtpPassword ? decrypt(settings.smtpPassword) : null,
  } : {
    smtpServer: null,
    smtpPort: null,
    smtpUsername: null,
    smtpPassword: null,
    smtpFromAddress: null,
    smtpSecure: null,
    appDomain: null,
    companyName: null,
  }
  settingsCacheTime = now

  return cachedSettings
}

/**
 * Check if SMTP is properly configured
 */
export async function isSmtpConfigured(): Promise<boolean> {
  try {
    const settings = await getEmailSettings()
    return !!(settings.smtpServer && settings.smtpPort && settings.smtpUsername && settings.smtpPassword)
  } catch (error) {
    console.error('Error checking SMTP configuration:', error)
    return false
  }
}

/**
 * Create a nodemailer transporter with current SMTP settings or provided config
 */
async function createTransporter(customConfig?: any) {
  // Use custom config if provided, otherwise load from database
  const settings = customConfig || await getEmailSettings()

  if (!settings.smtpServer || !settings.smtpPort || !settings.smtpUsername || !settings.smtpPassword) {
    throw new Error('SMTP settings are not configured. Please configure email settings in the admin panel.')
  }

  // Determine secure settings based on smtpSecure option
  const secureOption = settings.smtpSecure || 'STARTTLS'
  let secure = false
  let requireTLS = false

  if (secureOption === 'TLS') {
    secure = true // Use SSL/TLS (port 465)
  } else if (secureOption === 'STARTTLS') {
    secure = false // Use STARTTLS (port 587)
    requireTLS = true
  } else {
    secure = false // No encryption
    requireTLS = false
  }

  return nodemailer.createTransport({
    host: settings.smtpServer,
    port: settings.smtpPort,
    secure: secure,
    requireTLS: requireTLS,
    auth: {
      user: settings.smtpUsername,
      pass: settings.smtpPassword,
    },
  })
}

/**
 * Send an email
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string
  subject: string
  html: string
  text?: string
}) {
  try {
    const settings = await getEmailSettings()
    const transporter = await createTransporter()

    const fromAddress = settings.smtpFromAddress || settings.smtpUsername || 'noreply@vitransfer.com'
    const companyName = sanitizeEmailHeader(settings.companyName || 'ViTransfer')

    const info = await transporter.sendMail({
      from: `"${companyName}" <${fromAddress}>`,
      to,
      subject,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      html,
    })

    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('Error sending email:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Email template: New version uploaded
 */
export async function sendNewVersionEmail({
  clientEmail,
  clientName,
  projectTitle,
  videoName,
  versionLabel,
  shareUrl,
  isPasswordProtected = false,
  unsubscribeUrl,
}: {
  clientEmail: string
  clientName: string
  projectTitle: string
  videoName: string
  versionLabel: string
  shareUrl: string
  isPasswordProtected?: boolean
  unsubscribeUrl?: string
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'ViTransfer'

  const subject = `New Version Available: ${projectTitle}`

  const html = renderEmailShell({
    companyName,
    title: 'New Version Available',
    subtitle: 'Ready for your review',
    bodyContent: `
      <p style="margin: 0 0 20px 0; font-size: 16px; color: ${EMAIL_BRAND.text}; line-height: 1.5;">
        Hi <strong>${escapeHtml(clientName)}</strong>,
      </p>

      <p style="margin: 0 0 24px 0; font-size: 15px; color: ${EMAIL_BRAND.textSubtle}; line-height: 1.6;">
        A new version of your project is ready for review. Please take a moment to watch it and let us know what you think.
      </p>

      <div style="background: ${EMAIL_BRAND.accentSoftBg}; border: 1px solid ${EMAIL_BRAND.accentSoftBorder}; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 12px; font-weight: 700; color: ${EMAIL_BRAND.accent}; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.12em;">Project details</div>
        <div style="font-size: 15px; color: ${EMAIL_BRAND.text}; padding: 4px 0;">
          <strong>${escapeHtml(projectTitle)}</strong>
        </div>
        <div style="font-size: 14px; color: ${EMAIL_BRAND.textSubtle}; padding: 4px 0;">
          ${escapeHtml(videoName)} <span style="color: ${EMAIL_BRAND.accent}; font-weight: 600;">${escapeHtml(versionLabel)}</span>
        </div>
      </div>

      ${isPasswordProtected ? `
        <div style="background: ${EMAIL_BRAND.surfaceAlt}; border: 1px solid ${EMAIL_BRAND.border}; border-radius: 10px; padding: 14px; margin-bottom: 24px;">
          <div style="font-size: 14px; color: ${EMAIL_BRAND.textSubtle}; line-height: 1.5;">
            <strong>Protected project:</strong> Use the password sent separately to access this project.
          </div>
        </div>
      ` : ''}

      <div style="margin: 28px 0; text-align: center;">
        ${renderEmailButton({ href: shareUrl, label: 'View Project' })}
      </div>

      <p style="margin: 24px 0 0 0; font-size: 14px; color: ${EMAIL_BRAND.muted}; line-height: 1.5;">
        Questions or feedback? Simply reply to this email and we'll get back to you.
      </p>
      ${unsubscribeUrl ? renderUnsubscribeSection(unsubscribeUrl) : ''}
    `,
  })

  return sendEmail({
    to: clientEmail,
    subject,
    html,
  })
}

/**
 * Email template: Project approved
 */
export async function sendProjectApprovedEmail({
  clientEmail,
  clientName,
  projectTitle,
  shareUrl,
  approvedVideos = [],
  isComplete = true,
  unsubscribeUrl,
}: {
  clientEmail: string
  clientName: string
  projectTitle: string
  shareUrl: string
  approvedVideos?: Array<{ name: string; id: string }>
  isComplete?: boolean
  unsubscribeUrl?: string
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'ViTransfer'

  const subject = isComplete
    ? `${projectTitle} - Project Approved and Ready for Download`
    : `${projectTitle} - Video Approved`

  const statusTitle = isComplete ? 'Project Approved' : 'Video Approved'
  const statusMessage = isComplete
    ? 'All videos are approved and ready to deliver'
    : `${approvedVideos[0]?.name || 'Your video'} has been approved`

  const html = renderEmailShell({
    companyName,
    title: statusTitle,
    subtitle: statusMessage,
    bodyContent: `
      <p style="margin: 0 0 20px 0; font-size: 16px; color: ${EMAIL_BRAND.text}; line-height: 1.5;">
        Hi <strong>${escapeHtml(clientName)}</strong>,
      </p>

      <p style="margin: 0 0 24px 0; font-size: 15px; color: ${EMAIL_BRAND.textSubtle}; line-height: 1.6;">
        Great news! Your project <strong>${escapeHtml(projectTitle)}</strong> has been approved. You can now download the final version without watermarks.
      </p>

      ${approvedVideos.length > 0 ? `
        <div style="background: ${EMAIL_BRAND.surfaceAlt}; border: 1px solid ${EMAIL_BRAND.border}; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 12px; font-weight: 700; color: ${EMAIL_BRAND.accent}; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.12em;">Approved videos</div>
          ${approvedVideos.map(v => `
            <div style="font-size: 15px; color: ${EMAIL_BRAND.textSubtle}; padding: 4px 0;">
              <span style="display: inline-block; width: 6px; height: 6px; background: ${EMAIL_BRAND.accent}; border-radius: 50%; margin-right: 8px;"></span>${escapeHtml(v.name)}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div style="margin: 28px 0; text-align: center;">
        ${renderEmailButton({ href: shareUrl, label: 'Open Project' })}
      </div>

      <p style="margin: 24px 0 0 0; font-size: 14px; color: ${EMAIL_BRAND.muted}; line-height: 1.5;">
        Questions or need changes? Simply reply to this email and we'll be happy to help.
      </p>
      ${unsubscribeUrl ? renderUnsubscribeSection(unsubscribeUrl) : ''}
    `,
  })

  return sendEmail({
    to: clientEmail,
    subject,
    html,
  })
}

/**
 * Email template: Single comment notification (to clients)
 */
export async function sendCommentNotificationEmail({
  clientEmail,
  clientName,
  projectTitle,
  videoName,
  versionLabel,
  authorName,
  commentContent,
  timecode,
  shareUrl,
  unsubscribeUrl,
}: {
  clientEmail: string
  clientName: string
  projectTitle: string
  videoName: string
  versionLabel: string
  authorName: string
  commentContent: string
  timecode?: string | null
  shareUrl: string
  unsubscribeUrl?: string
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'ViTransfer'

  const subject = `New Comment: ${projectTitle}`

  const timecodeText = timecode ? `at ${timecode}` : ''

  const html = renderEmailShell({
    companyName,
    title: 'New Comment',
    subtitle: `New feedback on ${projectTitle}`,
    preheader: `New comment on ${projectTitle}`,
    bodyContent: `
      <p style="margin: 0 0 20px 0; font-size: 16px; color: ${EMAIL_BRAND.text}; line-height: 1.5;">
        Hi <strong>${escapeHtml(clientName)}</strong>,
      </p>

      <p style="margin: 0 0 24px 0; font-size: 15px; color: ${EMAIL_BRAND.textSubtle}; line-height: 1.6;">
        We've reviewed your video and left some feedback for you.
      </p>

      <div style="background: ${EMAIL_BRAND.surfaceAlt}; border: 1px solid ${EMAIL_BRAND.border}; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 12px; font-weight: 700; color: ${EMAIL_BRAND.muted}; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.12em;">Project</div>
        <div style="font-size: 15px; color: ${EMAIL_BRAND.text}; margin-bottom: 8px;">
          <strong>${escapeHtml(projectTitle)}</strong>
        </div>
        <div style="font-size: 14px; color: ${EMAIL_BRAND.muted};">
          ${escapeHtml(videoName)} <span style="color: ${EMAIL_BRAND.muted};">${escapeHtml(versionLabel)}</span>${timecodeText ? ` <span style="color: ${EMAIL_BRAND.muted};">• ${timecodeText}</span>` : ''}
        </div>
      </div>

      <div style="background: ${EMAIL_BRAND.accentSoftBg}; border: 1px solid ${EMAIL_BRAND.accentSoftBorder}; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 700; color: ${EMAIL_BRAND.text}; margin-bottom: 8px;">${escapeHtml(authorName)}</div>
        <div style="font-size: 15px; color: ${EMAIL_BRAND.textSubtle}; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(commentContent)}</div>
      </div>

      <div style="margin: 28px 0; text-align: center;">
        ${renderEmailButton({ href: shareUrl, label: 'View and Reply' })}
      </div>

      <p style="margin: 24px 0 0 0; font-size: 14px; color: ${EMAIL_BRAND.muted}; line-height: 1.5;">
        Questions? Simply reply to this email.
      </p>
      ${unsubscribeUrl ? renderUnsubscribeSection(unsubscribeUrl) : ''}
    `,
  })

  return sendEmail({
    to: clientEmail,
    subject,
    html,
  })
}

/**
 * Email template: Single comment notification (to admins)
 */
export async function sendAdminCommentNotificationEmail({
  adminEmails,
  clientName,
  clientEmail,
  projectTitle,
  videoName,
  versionLabel,
  commentContent,
  timecode,
  shareUrl,
}: {
  adminEmails: string[]
  clientName: string
  clientEmail?: string | null
  projectTitle: string
  videoName: string
  versionLabel: string
  commentContent: string
  timecode?: string | null
  shareUrl: string
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'ViTransfer'

  const subject = `Client Feedback: ${projectTitle}`

  const timecodeText = timecode ? `at ${timecode}` : ''

  const html = renderEmailShell({
    companyName,
    title: 'New Client Feedback',
    subtitle: `New comment on ${projectTitle}`,
    preheader: `New client comment: ${projectTitle}`,
    bodyContent: `
      <div style="background: ${EMAIL_BRAND.surfaceAlt}; border: 1px solid ${EMAIL_BRAND.border}; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 12px; font-weight: 700; color: ${EMAIL_BRAND.muted}; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.12em;">Client</div>
        <div style="font-size: 16px; color: ${EMAIL_BRAND.text}; margin-bottom: 4px;">
          <strong>${escapeHtml(clientName)}</strong>
        </div>
        ${clientEmail ? `
          <div style="font-size: 14px; color: ${EMAIL_BRAND.muted};">
            ${escapeHtml(clientEmail)}
          </div>
        ` : ''}
      </div>

      <div style="background: ${EMAIL_BRAND.surfaceAlt}; border: 1px solid ${EMAIL_BRAND.border}; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 12px; font-weight: 700; color: ${EMAIL_BRAND.muted}; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.12em;">Project</div>
        <div style="font-size: 15px; color: ${EMAIL_BRAND.text}; margin-bottom: 8px;">
          <strong>${escapeHtml(projectTitle)}</strong>
        </div>
        <div style="font-size: 14px; color: ${EMAIL_BRAND.muted};">
          ${escapeHtml(videoName)} <span style="color: ${EMAIL_BRAND.muted};">${escapeHtml(versionLabel)}</span>${timecodeText ? ` <span style="color: ${EMAIL_BRAND.muted};">• ${timecodeText}</span>` : ''}
        </div>
      </div>

      <div style="background: ${EMAIL_BRAND.accentSoftBg}; border: 1px solid ${EMAIL_BRAND.accentSoftBorder}; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 12px; font-weight: 700; color: ${EMAIL_BRAND.accent}; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.12em;">Comment</div>
        <div style="font-size: 15px; color: ${EMAIL_BRAND.textSubtle}; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(commentContent)}</div>
      </div>

      <div style="margin: 28px 0; text-align: center;">
        ${renderEmailButton({ href: shareUrl, label: 'View in Admin Panel' })}
      </div>
    `,
  })

  // Send to all admin emails
  const promises = adminEmails.map(email =>
    sendEmail({
      to: email,
      subject,
      html,
    })
  )

  const results = await Promise.allSettled(promises)
  const successCount = results.filter(r => r.status === 'fulfilled').length

  return {
    success: successCount > 0,
    message: `Sent to ${successCount}/${adminEmails.length} admins`
  }
}

/**
 * Email template: Project approved by client (to admin)
 */
export async function sendAdminProjectApprovedEmail({
  adminEmails,
  clientName,
  projectTitle,
  approvedVideos = [],
  isComplete = true,
  isApproval = true,
}: {
  adminEmails: string[]
  clientName: string
  projectTitle: string
  approvedVideos?: Array<{ name: string; id: string }>
  isComplete?: boolean
  isApproval?: boolean
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'ViTransfer'
  const appDomain = settings.appDomain

  if (!appDomain) {
    throw new Error('App domain not configured. Please configure domain in Settings to enable email notifications.')
  }

  // Determine subject and title based on approval/unapproval and complete/partial
  const action = isApproval ? 'Approved' : 'Unapproved'
  const subject = isComplete
    ? `Client ${action} Project: ${projectTitle}`
    : `Client ${action} Video: ${projectTitle} - ${approvedVideos[0]?.name || 'Video'}`

  const statusTitle = isComplete ? `Project ${action}` : `Video ${action}`
  const statusMessage = isComplete
    ? `The complete project has been ${isApproval ? 'approved' : 'unapproved'} by the client`
    : `${approvedVideos[0]?.name || 'A video'} has been ${isApproval ? 'approved' : 'unapproved'} by the client`

  const html = renderEmailShell({
    companyName,
    title: statusTitle,
    subtitle: statusMessage,
    preheader: `${statusTitle}: ${projectTitle}`,
    bodyContent: `
      ${approvedVideos.length > 0 ? `
        <div style="background: ${EMAIL_BRAND.surfaceAlt}; border: 1px solid ${EMAIL_BRAND.border}; border-radius: 10px; padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 12px; font-weight: 700; color: ${EMAIL_BRAND.accent}; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.12em;">${isApproval ? 'Approved' : 'Unapproved'} videos</div>
          ${approvedVideos.map(v => `
            <div style="font-size: 15px; color: ${EMAIL_BRAND.textSubtle}; padding: 4px 0;">
              <span style="display: inline-block; width: 6px; height: 6px; background: ${EMAIL_BRAND.accent}; border-radius: 50%; margin-right: 8px;"></span>${escapeHtml(v.name)}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div style="margin: 28px 0; text-align: center;">
        ${renderEmailButton({ href: `${appDomain}/admin`, label: 'View in Admin Panel' })}
      </div>
    `,
  })

  // Send to all admin emails
  const promises = adminEmails.map(email =>
    sendEmail({
      to: email,
      subject,
      html,
    })
  )

  const results = await Promise.allSettled(promises)
  const successCount = results.filter(r => r.status === 'fulfilled').length

  return {
    success: successCount > 0,
    message: `Sent to ${successCount}/${adminEmails.length} admins`
  }
}

/**
 * Email template: General project notification (entire project with all ready videos)
 */
export async function sendProjectGeneralNotificationEmail({
  clientEmail,
  clientName,
  projectTitle,
  projectDescription,
  shareUrl,
  readyVideos = [],
  isPasswordProtected = false,
  unsubscribeUrl,
}: {
  clientEmail: string
  clientName: string
  projectTitle: string
  projectDescription: string
  shareUrl: string
  readyVideos?: Array<{ name: string; versionLabel: string }>
  isPasswordProtected?: boolean
  unsubscribeUrl?: string
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'ViTransfer'

  const subject = `Project Ready for Review: ${escapeHtml(projectTitle)}`

  const passwordNotice = isPasswordProtected
    ? `<div style="border:1px solid ${EMAIL_BRAND.accentSoftBorder}; border-radius:10px; padding:12px 14px; font-size:14px; color:${EMAIL_BRAND.textSubtle}; margin:0 0 14px; background:${EMAIL_BRAND.accentSoftBg};">
        Protected project. Use the password sent separately to open the link.
      </div>`
    : ''

  const html = renderEmailShell({
    companyName,
    title: 'Project Ready for Review',
    subtitle: projectTitle,
    preheader: `Project ready: ${projectTitle}`,
    bodyContent: `
      <p style="margin:0 0 20px; font-size:16px; color:${EMAIL_BRAND.text};">
        Hi <strong>${escapeHtml(clientName)}</strong>,
      </p>
      <p style="margin:0 0 24px; font-size:15px; color:${EMAIL_BRAND.textSubtle};">
        Your project is ready for review. Click below to view and leave feedback.
      </p>
      ${projectDescription ? `
        <div style="background:${EMAIL_BRAND.accentSoftBg}; border:1px solid ${EMAIL_BRAND.accentSoftBorder}; border-radius:10px; padding:20px; margin-bottom:20px;">
          <div style="font-size:12px; font-weight:700; color:${EMAIL_BRAND.accent}; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.12em;">Project overview</div>
          <div style="font-size:15px; color:${EMAIL_BRAND.textSubtle}; line-height:1.6;">${escapeHtml(projectDescription)}</div>
        </div>
      ` : ''}
      ${readyVideos.length > 0 ? `
        <div style="background:${EMAIL_BRAND.surfaceAlt}; border:1px solid ${EMAIL_BRAND.border}; border-radius:10px; padding:20px; margin-bottom:24px;">
          <div style="font-size:12px; font-weight:700; color:${EMAIL_BRAND.muted}; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.12em;">Ready to view</div>
          ${readyVideos.map(v => `
            <div style="font-size:15px; color:${EMAIL_BRAND.textSubtle}; padding:6px 0;">
              • ${escapeHtml(v.name)} <span style="color:${EMAIL_BRAND.accent}; font-weight:600;">${escapeHtml(v.versionLabel)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${passwordNotice}
      <div style="margin: 28px 0; text-align: center;">
        ${renderEmailButton({ href: shareUrl, label: 'View Project' })}
      </div>
      <p style="margin:24px 0 0; font-size:14px; color:${EMAIL_BRAND.muted}; text-align:center;">
        Questions? Reply to this email.
      </p>
      ${unsubscribeUrl ? renderUnsubscribeSection(unsubscribeUrl) : ''}
    `,
  })

  return sendEmail({
    to: clientEmail,
    subject,
    html,
  })
}

/**
 * Email template: Send password in separate email for security
 */
export async function sendPasswordEmail({
  clientEmail,
  clientName,
  projectTitle,
  password,
  unsubscribeUrl,
}: {
  clientEmail: string
  clientName: string
  projectTitle: string
  password: string
  unsubscribeUrl?: string
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'ViTransfer'

  const subject = `Access Password: ${escapeHtml(projectTitle)}`

  const html = renderEmailShell({
    companyName,
    title: 'Project Password',
    subtitle: projectTitle,
    preheader: `Password for ${projectTitle}`,
    bodyContent: `
      <p style="margin:0 0 16px; font-size:15px; color:${EMAIL_BRAND.text}; line-height:1.6;">
        Hi <strong>${escapeHtml(clientName)}</strong>,
      </p>
      <p style="margin:0 0 16px; font-size:15px; color:${EMAIL_BRAND.textSubtle}; line-height:1.6;">
        Use this password to open your protected project link. We send it separately for security.
      </p>
      <div style="background:${EMAIL_BRAND.surfaceAlt}; border:1px solid ${EMAIL_BRAND.border}; padding:14px 16px; margin-bottom:12px; border-radius:10px;">
        <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${EMAIL_BRAND.muted}; margin-bottom:6px; font-weight:700;">Project</div>
        <div style="font-size:16px; font-weight:700; color:${EMAIL_BRAND.text};">${escapeHtml(projectTitle)}</div>
      </div>
      <div style="background:${EMAIL_BRAND.accentSoftBg}; border:1px solid ${EMAIL_BRAND.accentSoftBorder}; padding:16px; margin:6px 0 16px; border-radius:12px; text-align:center;">
        <div style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:${EMAIL_BRAND.accent}; font-weight:800; margin-bottom:10px;">Password</div>
        <div style="display:inline-block; padding:10px 14px; border-radius:10px; border:1px dashed ${EMAIL_BRAND.accent}; font-family:'SFMono-Regular', Menlo, Consolas, monospace; font-size:18px; color:${EMAIL_BRAND.text}; letter-spacing:1px; word-break:break-all; background:#ffffff;">
          ${escapeHtml(password)}
        </div>
      </div>
      <p style="font-size:13px; color:${EMAIL_BRAND.textSubtle}; padding:0; margin:0 0 10px;">
        Keep this password confidential. For security, do not forward this email.
      </p>
      <p style="font-size:13px; color:${EMAIL_BRAND.muted}; margin:0; text-align:center;">
        Pair this password with the review link we sent in the previous email.
      </p>
      ${unsubscribeUrl ? renderUnsubscribeSection(unsubscribeUrl) : ''}
    `,
  })

  return sendEmail({
    to: clientEmail,
    subject,
    html,
  })
}

/**
 * Test SMTP connection and send a test email
 */
export async function testEmailConnection(testEmail: string, customConfig?: any) {
  try {
    // Use custom config if provided, otherwise load from database
    const settings = customConfig || await getEmailSettings()
    const transporter = await createTransporter(customConfig)

    // Verify connection
    await transporter.verify()

    // Send test email
    const html = renderEmailShell({
      companyName: settings.companyName || 'ViTransfer',
      title: 'SMTP Test Succeeded',
      subtitle: 'Email sending is working',
      preheader: 'SMTP configuration is working',
      bodyContent: `
        <p style="font-size:15px; color:${EMAIL_BRAND.textSubtle}; line-height:1.6; margin:0 0 12px;">
          Your SMTP configuration is working. Details below for your records.
        </p>
        <div style="border:1px solid ${EMAIL_BRAND.border}; border-radius:10px; padding:14px 16px; background:${EMAIL_BRAND.surfaceAlt};">
          <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${EMAIL_BRAND.muted}; margin-bottom:8px; font-weight:700;">Connection details</div>
          <div style="font-size:14px; color:${EMAIL_BRAND.text}; line-height:1.6;">
            <div><strong>Server:</strong> ${settings.smtpServer}</div>
            <div><strong>Port:</strong> ${settings.smtpPort}</div>
            <div><strong>Security:</strong> ${settings.smtpSecure || 'STARTTLS'}</div>
            <div><strong>From:</strong> ${settings.smtpFromAddress}</div>
          </div>
        </div>
      `,
    })

    // Send directly with transporter if custom config, otherwise use sendEmail
    if (customConfig) {
      await transporter.sendMail({
        from: settings.smtpFromAddress,
        to: testEmail,
        subject: 'Test Email - SMTP Configuration Working',
        html,
      })
    } else {
      await sendEmail({
        to: testEmail,
        subject: 'Test Email - SMTP Configuration Working',
        html,
      })
    }

    return { success: true, message: 'Test email sent successfully!' }
  } catch (error) {
    console.error('Email test failed:', error)
    throw error
  }
}
