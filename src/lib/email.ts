import nodemailer from 'nodemailer'
import { prisma } from './db'
import { decrypt } from './encryption'

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
  headerGradient: string
}

export function renderEmailShell({
  companyName,
  title,
  subtitle,
  bodyContent,
  footerNote,
  headerGradient,
}: EmailShellOptions) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: ${headerGradient}; padding: 32px 24px; text-align: center;">
      <div style="font-size: 24px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">${escapeHtml(title)}</div>
      ${subtitle ? `<div style="font-size: 15px; color: rgba(255,255,255,0.95);">${escapeHtml(subtitle)}</div>` : ''}
    </div>

    <!-- Content -->
    <div style="padding: 32px 24px;">
      ${bodyContent}
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 20px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; font-size: 13px; color: #9ca3af;">
        ${escapeHtml(footerNote || companyName)}
      </p>
    </div>

  </div>
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
}: {
  clientEmail: string
  clientName: string
  projectTitle: string
  videoName: string
  versionLabel: string
  shareUrl: string
  isPasswordProtected?: boolean
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'Studio'

  const subject = `New Version Available: ${projectTitle}`

  const html = renderEmailShell({
    companyName,
    headerGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    title: 'New Version Available',
    subtitle: 'Ready for your review',
    bodyContent: `
      <p style="margin: 0 0 20px 0; font-size: 16px; color: #111827; line-height: 1.5;">
        Hi <strong>${escapeHtml(clientName)}</strong>,
      </p>

      <p style="margin: 0 0 24px 0; font-size: 15px; color: #374151; line-height: 1.6;">
        A new version of your project is ready for review. Please take a moment to watch it and let us know what you think.
      </p>

      <div style="background: #eff6ff; border: 1px solid #93c5fd; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 600; color: #1e40af; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Project Details</div>
        <div style="font-size: 15px; color: #1e3a8a; padding: 4px 0;">
          <strong>${escapeHtml(projectTitle)}</strong>
        </div>
        <div style="font-size: 14px; color: #3b82f6; padding: 4px 0;">
          ${escapeHtml(videoName)} <span style="color: #60a5fa;">${escapeHtml(versionLabel)}</span>
        </div>
      </div>

      ${isPasswordProtected ? `
        <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; padding: 14px; margin-bottom: 24px;">
          <div style="font-size: 14px; color: #92400e; line-height: 1.5;">
            <strong>Password Protected:</strong> Use the password previously sent to you to access this project.
          </div>
        </div>
      ` : ''}

      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(shareUrl)}" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 4px rgba(59,130,246,0.2);">
          View Project
        </a>
      </div>

      <p style="margin: 24px 0 0 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
        Questions or feedback? Simply reply to this email and we'll get back to you.
      </p>
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
}: {
  clientEmail: string
  clientName: string
  projectTitle: string
  shareUrl: string
  approvedVideos?: Array<{ name: string; id: string }>
  isComplete?: boolean
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'Studio'

  const subject = isComplete
    ? `${projectTitle} - Project Approved and Ready for Download`
    : `${projectTitle} - Video Approved`

  const statusTitle = isComplete ? 'Project Approved' : 'Video Approved'
  const statusMessage = isComplete
    ? 'All videos are approved and ready to deliver'
    : `${approvedVideos[0]?.name || 'Your video'} has been approved`

  const html = renderEmailShell({
    companyName,
    headerGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    title: statusTitle,
    subtitle: statusMessage,
    bodyContent: `
      <p style="margin: 0 0 20px 0; font-size: 16px; color: #111827; line-height: 1.5;">
        Hi <strong>${escapeHtml(clientName)}</strong>,
      </p>

      <p style="margin: 0 0 24px 0; font-size: 15px; color: #374151; line-height: 1.6;">
        Great news! Your project <strong>${escapeHtml(projectTitle)}</strong> has been approved. You can now download the final version without watermarks.
      </p>

      ${approvedVideos.length > 0 ? `
        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 13px; font-weight: 600; color: #065f46; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Approved Videos</div>
          ${approvedVideos.map(v => `
            <div style="font-size: 15px; color: #166534; padding: 4px 0;">
              <span style="display: inline-block; width: 6px; height: 6px; background: #10b981; border-radius: 50%; margin-right: 8px;"></span>${escapeHtml(v.name)}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(shareUrl)}" style="display: inline-block; background: #10b981; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 4px rgba(16,185,129,0.2);">
          Download Now
        </a>
      </div>

      <p style="margin: 24px 0 0 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
        Questions or need changes? Simply reply to this email and we'll be happy to help.
      </p>
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
  timestamp,
  shareUrl,
}: {
  clientEmail: string
  clientName: string
  projectTitle: string
  videoName: string
  versionLabel: string
  authorName: string
  commentContent: string
  timestamp?: number | null
  shareUrl: string
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'Studio'

  const subject = `New Comment: ${projectTitle}`

  const timestampText = timestamp !== null && timestamp !== undefined
    ? `at ${Math.floor(timestamp / 60)}:${Math.floor(timestamp % 60).toString().padStart(2, '0')}`
    : ''

  const html = renderEmailShell({
    companyName,
    headerGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    title: 'New Comment',
    subtitle: `${companyName} left feedback on your video`,
    bodyContent: `
      <p style="margin: 0 0 20px 0; font-size: 16px; color: #111827; line-height: 1.5;">
        Hi <strong>${escapeHtml(clientName)}</strong>,
      </p>

      <p style="margin: 0 0 24px 0; font-size: 15px; color: #374151; line-height: 1.6;">
        We've reviewed your video and left some feedback for you.
      </p>

      <div style="background: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 600; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Project</div>
        <div style="font-size: 15px; color: #111827; margin-bottom: 8px;">
          <strong>${escapeHtml(projectTitle)}</strong>
        </div>
        <div style="font-size: 14px; color: #6b7280;">
          ${escapeHtml(videoName)} <span style="color: #9ca3af;">${escapeHtml(versionLabel)}</span>${timestampText ? ` <span style="color: #9ca3af;">• ${timestampText}</span>` : ''}
        </div>
      </div>

      <div style="background: #eff6ff; border-left: 3px solid #3b82f6; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 600; color: #1e40af; margin-bottom: 8px;">${escapeHtml(authorName)}</div>
        <div style="font-size: 15px; color: #374151; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(commentContent)}</div>
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(shareUrl)}" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 4px rgba(59,130,246,0.2);">
          View and Reply
        </a>
      </div>

      <p style="margin: 24px 0 0 0; font-size: 14px; color: #6b7280; line-height: 1.5;">
        Questions? Simply reply to this email.
      </p>
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
  timestamp,
  shareUrl,
}: {
  adminEmails: string[]
  clientName: string
  clientEmail?: string | null
  projectTitle: string
  videoName: string
  versionLabel: string
  commentContent: string
  timestamp?: number | null
  shareUrl: string
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'Studio'

  const subject = `Client Feedback: ${projectTitle}`

  const timestampText = timestamp !== null && timestamp !== undefined
    ? `at ${Math.floor(timestamp / 60)}:${Math.floor(timestamp % 60).toString().padStart(2, '0')}`
    : ''

  const html = renderEmailShell({
    companyName,
    headerGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    title: 'New Client Feedback',
    subtitle: 'Your client left a comment',
    bodyContent: `
      <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Client</div>
        <div style="font-size: 16px; color: #78350f; margin-bottom: 4px;">
          <strong>${escapeHtml(clientName)}</strong>
        </div>
        ${clientEmail ? `
          <div style="font-size: 14px; color: #b45309;">
            ${escapeHtml(clientEmail)}
          </div>
        ` : ''}
      </div>

      <div style="background: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 600; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Project</div>
        <div style="font-size: 15px; color: #111827; margin-bottom: 8px;">
          <strong>${escapeHtml(projectTitle)}</strong>
        </div>
        <div style="font-size: 14px; color: #6b7280;">
          ${escapeHtml(videoName)} <span style="color: #9ca3af;">${escapeHtml(versionLabel)}</span>${timestampText ? ` <span style="color: #9ca3af;">• ${timestampText}</span>` : ''}
        </div>
      </div>

      <div style="background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 600; color: #b45309; margin-bottom: 8px;">Comment</div>
        <div style="font-size: 15px; color: #78350f; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(commentContent)}</div>
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(shareUrl)}" style="display: inline-block; background: #f59e0b; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 4px rgba(245,158,11,0.2);">
          View in Admin Panel
        </a>
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
  const companyName = settings.companyName || 'Studio'
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

  const headerGradient = isApproval
    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
    : 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)'
  const buttonColor = isApproval ? '#10b981' : '#f97316'

  const boxBg = isApproval ? '#f0fdf4' : '#fef3c7'
  const boxBorder = isApproval ? '#86efac' : '#fcd34d'
  const textColor = isApproval ? '#065f46' : '#78350f'
  const itemColor = isApproval ? '#166534' : '#92400e'
  const bulletColor = isApproval ? '#10b981' : '#f59e0b'
  const buttonBg = isApproval ? '#10b981' : '#f59e0b'
  const buttonShadow = isApproval ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'

  const html = renderEmailShell({
    companyName,
    headerGradient,
    title: statusTitle,
    subtitle: statusMessage,
    bodyContent: `
      ${approvedVideos.length > 0 ? `
        <div style="background: ${boxBg}; border: 1px solid ${boxBorder}; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 13px; font-weight: 600; color: ${textColor}; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">${isApproval ? 'Approved' : 'Unapproved'} Videos</div>
          ${approvedVideos.map(v => `
            <div style="font-size: 15px; color: ${itemColor}; padding: 4px 0;">
              <span style="display: inline-block; width: 6px; height: 6px; background: ${bulletColor}; border-radius: 50%; margin-right: 8px;"></span>${escapeHtml(v.name)}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(appDomain)}/admin" style="display: inline-block; background: ${buttonBg}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 4px ${buttonShadow};">
          View in Admin Panel
        </a>
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
}: {
  clientEmail: string
  clientName: string
  projectTitle: string
  projectDescription: string
  shareUrl: string
  readyVideos?: Array<{ name: string; versionLabel: string }>
  isPasswordProtected?: boolean
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'Studio'

  const subject = `Project Ready for Review: ${escapeHtml(projectTitle)}`

  const passwordNotice = isPasswordProtected
    ? `<div style="border:1px dashed #0ea5e9; border-radius:10px; padding:12px 14px; font-size:14px; color:#0f172a; margin:0 0 14px; background:#f0f9ff;">
        Password protected. Use the password sent separately to open the link.
      </div>`
    : ''

  const videosList = readyVideos.length > 0
    ? `<div style="border:1px solid #bae6fd; padding:14px 16px; margin:0 0 14px; border-radius:10px; background:#f8fbff;">
        <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#0ea5e9; margin-bottom:6px;">Ready to view</div>
        ${readyVideos.map(v => `<div style="font-size:15px; color:#0f172a; padding:4px 0;">${escapeHtml(v.name)} <span style="color:#0ea5e9;">${escapeHtml(v.versionLabel)}</span></div>`).join('')}
      </div>`
    : ''

  const html = renderEmailShell({
    companyName,
    headerGradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
    title: 'Project Ready for Review',
    subtitle: projectTitle,
    bodyContent: `
      <p style="margin:0 0 20px; font-size:16px;">
        Hi <strong>${escapeHtml(clientName)}</strong>,
      </p>
      <p style="margin:0 0 24px; font-size:15px;">
        Your project is ready for review. Click below to view and leave feedback.
      </p>
      ${projectDescription ? `
        <div style="background:linear-gradient(135deg, #ecfeff 0%, #cffafe 100%); border-left:4px solid #06b6d4; border-radius:8px; padding:20px; margin-bottom:20px;">
          <div style="font-size:13px; font-weight:600; color:#155e75; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.05em;">Project Overview</div>
          <div style="font-size:15px; color:#164e63; line-height:1.6;">${escapeHtml(projectDescription)}</div>
        </div>
      ` : ''}
      ${readyVideos.length > 0 ? `
        <div style="background:#f9fafb; border-radius:8px; padding:20px; margin-bottom:24px;">
          <div style="font-size:13px; font-weight:600; color:#6b7280; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.05em;">Ready to View</div>
          ${readyVideos.map(v => `
            <div style="font-size:15px; color:#374151; padding:6px 0;">
              • ${escapeHtml(v.name)} <span style="color:#06b6d4;">${escapeHtml(v.versionLabel)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${passwordNotice}
      <div style="text-align:center; margin:32px 0;">
        <a href="${escapeHtml(shareUrl)}" style="display:inline-block; background:#06b6d4; color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:8px; font-size:16px; font-weight:600; box-shadow:0 4px 12px rgba(6,182,212,0.3);">
          View Project
        </a>
      </div>
      <p style="margin:24px 0 0; font-size:14px; color:#6b7280; text-align:center;">
        Questions? Reply to this email.
      </p>
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
}: {
  clientEmail: string
  clientName: string
  projectTitle: string
  password: string
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'Studio'

  const subject = `Access Password: ${escapeHtml(projectTitle)}`

  const html = renderEmailShell({
    companyName,
    headerGradient: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
    title: 'Project Password',
    subtitle: projectTitle,
    bodyContent: `
      <p style="margin:0 0 16px; font-size:15px; color:#1f2937; line-height:1.6;">
        Hi <strong>${escapeHtml(clientName)}</strong>,
      </p>
      <p style="margin:0 0 16px; font-size:15px; color:#374151; line-height:1.6;">
        Use this password to open your private project link. We send it separately for security.
      </p>
      <div style="border:1px solid #fecdd3; padding:14px 16px; margin-bottom:12px; border-radius:10px;">
        <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#dc2626; margin-bottom:6px;">Project</div>
        <div style="font-size:16px; font-weight:700; color:#7f1d1d;">${escapeHtml(projectTitle)}</div>
      </div>
      <div style="border:1px solid #dc2626; padding:16px; margin:6px 0 16px; border-radius:12px; text-align:center;">
        <div style="font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:#b91c1c; font-weight:700; margin-bottom:8px;">Password</div>
        <div style="display:inline-block; padding:10px 14px; border-radius:8px; border:1px dashed #dc2626; font-family:'SFMono-Regular', Menlo, Consolas, monospace; font-size:18px; color:#7f1d1d; letter-spacing:1px; word-break:break-all;">
          ${escapeHtml(password)}
        </div>
      </div>
      <p style="font-size:13px; color:#7f1d1d; padding:0; margin:0 0 10px;">
        Keep this password confidential. For security, do not forward this email.
      </p>
      <p style="font-size:13px; color:#6b7280; margin:0; text-align:center;">
        Pair this password with the review link we sent in the previous email.
      </p>
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
      headerGradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      title: 'SMTP Test Succeeded',
      subtitle: 'Email sending is working',
      bodyContent: `
        <p style="font-size:15px; color:#1f2937; line-height:1.6; margin:0 0 12px;">
          Your SMTP configuration is working. Details below for your records.
        </p>
        <div style="border:1px solid #bbf7d0; border-radius:10px; padding:14px 16px;">
          <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:#15803d; margin-bottom:6px;">Connection details</div>
          <div style="font-size:14px; color:#0f172a; line-height:1.6;">
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
