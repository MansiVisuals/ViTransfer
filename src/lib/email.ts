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
async function getEmailSettings(): Promise<EmailSettings> {
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

    const fromAddress = settings.smtpFromAddress || settings.smtpUsername || 'noreply@vidtransfer.com'
    const companyName = settings.companyName || 'VidTransfer'

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

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 32px 24px; text-align: center;">
      <div style="font-size: 24px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">New Version Available</div>
      <div style="font-size: 15px; color: rgba(255,255,255,0.95);">Ready for your review</div>
    </div>

    <!-- Content -->
    <div style="padding: 32px 24px;">
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
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 20px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; font-size: 13px; color: #9ca3af;">
        ${escapeHtml(companyName)}
      </p>
    </div>

  </div>
</body>
</html>
  `

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
    ? 'All videos have been approved and are ready for download'
    : `${approvedVideos[0]?.name || 'Your video'} has been approved`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px 24px; text-align: center;">
      <div style="font-size: 24px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">${statusTitle}</div>
      <div style="font-size: 15px; color: rgba(255,255,255,0.95);">${statusMessage}</div>
    </div>

    <!-- Content -->
    <div style="padding: 32px 24px;">
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
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 20px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; font-size: 13px; color: #9ca3af;">
        ${escapeHtml(companyName)}
      </p>
    </div>

  </div>
</body>
</html>
  `

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

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 32px 24px; text-align: center;">
      <div style="font-size: 24px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">New Comment</div>
      <div style="font-size: 15px; color: rgba(255,255,255,0.95);">${escapeHtml(companyName)} left feedback on your video</div>
    </div>

    <!-- Content -->
    <div style="padding: 32px 24px;">
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
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 20px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; font-size: 13px; color: #9ca3af;">
        ${escapeHtml(companyName)}
      </p>
    </div>

  </div>
</body>
</html>
  `

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

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px 24px; text-align: center;">
      <div style="font-size: 24px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">New Client Feedback</div>
      <div style="font-size: 15px; color: rgba(255,255,255,0.95);">Your client left a comment</div>
    </div>

    <!-- Content -->
    <div style="padding: 32px 24px;">
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
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 20px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; font-size: 13px; color: #9ca3af;">
        Automated notification from ${escapeHtml(companyName)}
      </p>
    </div>

  </div>
</body>
</html>
  `

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

  // Color scheme based on approval/unapproval
  const headerGradient = isApproval
    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'  // Green for approval
    : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'  // Orange for unapproval
  const boxBg = isApproval ? '#f0fdf4' : '#fef3c7'
  const boxBorder = isApproval ? '#86efac' : '#fcd34d'
  const textColor = isApproval ? '#065f46' : '#78350f'
  const itemColor = isApproval ? '#166534' : '#92400e'
  const bulletColor = isApproval ? '#10b981' : '#f59e0b'
  const buttonBg = isApproval ? '#10b981' : '#f59e0b'
  const buttonShadow = isApproval ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'

  const html = `
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
      <div style="font-size: 24px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">${statusTitle}</div>
      <div style="font-size: 15px; color: rgba(255,255,255,0.95);">${statusMessage}</div>
    </div>

    <!-- Content -->
    <div style="padding: 32px 24px;">
      <p style="margin: 0 0 20px 0; font-size: 15px; color: #374151; line-height: 1.6;">
        <strong>${escapeHtml(clientName)}</strong> has ${isApproval ? 'approved' : 'unapproved'} ${isComplete ? 'the project' : 'a video in'} <strong>${escapeHtml(projectTitle)}</strong>.
      </p>

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
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 20px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; font-size: 13px; color: #9ca3af;">
        Automated notification from ${escapeHtml(companyName)}
      </p>
    </div>

  </div>
</body>
</html>
  `

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
    ? `<p style="font-size: 14px; color: #d97706; background: #fef3c7; padding: 12px; border-radius: 4px; margin: 15px 0;">
        <strong>Note:</strong> This project is password protected. Check your email for the access password.
      </p>`
    : ''

  const videosList = readyVideos.length > 0
    ? `<div style="background: white; border: 1px solid #e5e7eb; padding: 15px; margin: 15px 0; border-radius: 6px;">
        <p style="margin: 0 0 10px 0; font-weight: 600;">Available Videos:</p>
        <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #666;">
          ${readyVideos.map(v => `<li style="margin: 5px 0;">${escapeHtml(v.name)} - ${escapeHtml(v.versionLabel)}</li>`).join('')}
        </ul>
      </div>`
    : ''

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="padding: 30px; background: #f9fafb; border-radius: 8px;">
    <h1 style="margin: 0 0 10px 0; font-size: 24px; color: #111;">${escapeHtml(companyName)}</h1>
    <p style="margin: 0 0 25px 0; font-size: 14px; color: #666;">Project Ready for Review</p>

    <p style="margin: 0 0 20px 0;">Hi ${escapeHtml(clientName)},</p>

    <p style="margin: 0 0 20px 0;">Your project is ready for review:</p>

    <div style="background: white; border: 1px solid #e5e7eb; padding: 20px; margin: 20px 0; border-radius: 6px;">
      <p style="margin: 0 0 10px 0; font-size: 18px; font-weight: 600; color: #111;">${escapeHtml(projectTitle)}</p>
      ${projectDescription ? `<p style="margin: 5px 0 0 0; font-size: 14px; color: #666; font-style: italic;">${escapeHtml(projectDescription)}</p>` : ''}
    </div>

    ${videosList}
    ${passwordNotice}

    <div style="margin: 25px 0;">
      <a href="${escapeHtml(shareUrl)}" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 500;">
        View Project
      </a>
    </div>

    <p style="font-size: 14px; color: #666; margin: 25px 0 0 0;">
      Questions? Reply to this email.
    </p>
  </div>
</body>
</html>
  `

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

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="padding: 30px; background: #f9fafb; border-radius: 8px;">
    <h1 style="margin: 0 0 10px 0; font-size: 24px; color: #111;">${escapeHtml(companyName)}</h1>
    <p style="margin: 0 0 25px 0; font-size: 14px; color: #666;">Project Access Password</p>

    <p style="margin: 0 0 20px 0;">Hi ${escapeHtml(clientName)},</p>

    <p style="margin: 0 0 20px 0;">Here is your password to access the project:</p>

    <div style="background: white; border: 1px solid #e5e7eb; padding: 20px; margin: 20px 0; border-radius: 6px;">
      <p style="margin: 0 0 10px 0; font-size: 18px; font-weight: 600; color: #111;">${escapeHtml(projectTitle)}</p>
    </div>

    <div style="background: #fef3c7; border: 2px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 6px; text-align: center;">
      <p style="margin: 0 0 10px 0; font-size: 12px; color: #92400e; font-weight: 600; text-transform: uppercase;">Password</p>
      <p style="margin: 0; font-size: 20px; color: #78350f; font-weight: 700; font-family: 'Courier New', monospace; letter-spacing: 1px; word-break: break-all;">
        ${escapeHtml(password)}
      </p>
    </div>

    <p style="font-size: 13px; color: #dc2626; background: #fee2e2; padding: 12px; border-radius: 4px; margin: 15px 0;">
      <strong>Security:</strong> Keep this password confidential.
    </p>

    <p style="font-size: 14px; color: #666; margin: 25px 0 0 0;">
      Use this password with the project link sent in the previous email.
    </p>
  </div>
</body>
</html>
  `

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
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: #f3f4f6; padding: 30px; border-radius: 8px; text-align: center; margin-bottom: 30px; border: 2px solid #10b981;">
      <h1 style="color: #047857; margin: 0; font-size: 24px; font-weight: 700;">
        ✓ Test Email Successful
      </h1>
    </div>

    <div style="background: white; padding: 30px; border-radius: 8px; border: 1px solid #e5e7eb;">
      <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
        Your SMTP configuration is working correctly.
      </p>

      <div style="background: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #e5e7eb;">
        <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #666; font-weight: 600;">Connection Details:</h3>
        <p style="margin: 5px 0; font-size: 13px; color: #555;"><strong>Server:</strong> ${settings.smtpServer}</p>
        <p style="margin: 5px 0; font-size: 13px; color: #555;"><strong>Port:</strong> ${settings.smtpPort}</p>
        <p style="margin: 5px 0; font-size: 13px; color: #555;"><strong>Security:</strong> ${settings.smtpSecure || 'STARTTLS'}</p>
        <p style="margin: 5px 0; font-size: 13px; color: #555;"><strong>From:</strong> ${settings.smtpFromAddress}</p>
      </div>

      <p style="font-size: 14px; color: #666; margin-top: 20px;">
        You can now send email notifications to your clients.
      </p>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 12px; color: #999; margin-bottom: 0; text-align: center;">
      This is a test email from ${settings.companyName || 'VidTransfer'}
    </p>
  </div>
</body>
</html>
    `

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
