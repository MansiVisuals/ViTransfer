import nodemailer from 'nodemailer'
import { prisma } from './db'
import { decrypt } from './encryption'

/**
 * Escape HTML to prevent XSS and email injection
 */
function escapeHtml(unsafe: string): string {
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

  const subject = `New Version Available: ${escapeHtml(projectTitle)} - ${escapeHtml(videoName)} ${escapeHtml(versionLabel)}`

  const passwordNotice = isPasswordProtected
    ? `<p style="font-size: 14px; color: #d97706; background: #fef3c7; padding: 12px; border-radius: 4px; margin: 15px 0;">
        <strong>Note:</strong> This project is password protected. ${isPasswordProtected ? 'Check your email for the access password.' : ''}
      </p>`
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
    <p style="margin: 0 0 25px 0; font-size: 14px; color: #666;">New Version Available</p>

    <p style="margin: 0 0 20px 0;">Hi ${escapeHtml(clientName)},</p>

    <p style="margin: 0 0 20px 0;">A new version is ready for review:</p>

    <div style="background: white; border: 1px solid #e5e7eb; padding: 20px; margin: 20px 0; border-radius: 6px;">
      <p style="margin: 0 0 10px 0; font-size: 18px; font-weight: 600; color: #111;">${escapeHtml(projectTitle)}</p>
      <p style="margin: 5px 0; color: #666;">Video: ${escapeHtml(videoName)}</p>
      <p style="margin: 5px 0; color: #666;">Version: ${escapeHtml(versionLabel)}</p>
    </div>

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
 * Email template: Reply to comment
 */
export async function sendReplyNotificationEmail({
  clientEmail,
  clientName,
  projectTitle,
  commentContent,
  replyContent,
  shareUrl,
}: {
  clientEmail: string
  clientName: string
  projectTitle: string
  commentContent: string
  replyContent: string
  shareUrl: string
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'Studio'

  const subject = `New Reply: ${escapeHtml(projectTitle)}`

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
    <p style="margin: 0 0 25px 0; font-size: 14px; color: #666;">New Reply to Your Comment</p>

    <p style="margin: 0 0 20px 0;">Hi ${escapeHtml(clientName)},</p>

    <p style="margin: 0 0 20px 0;">We replied to your comment on <strong>${escapeHtml(projectTitle)}</strong>:</p>

    <div style="background: white; border: 1px solid #e5e7eb; padding: 15px; margin: 15px 0; border-radius: 6px;">
      <p style="margin: 0 0 8px 0; font-size: 12px; color: #999;">Your comment:</p>
      <p style="margin: 0; font-size: 14px; color: #666; font-style: italic;">
        ${escapeHtml(commentContent).replace(/\n/g, '<br>')}
      </p>
    </div>

    <div style="background: #eff6ff; border-left: 3px solid #667eea; padding: 15px; margin: 15px 0; border-radius: 6px;">
      <p style="margin: 0 0 8px 0; font-size: 12px; color: #667eea; font-weight: 600;">Our reply:</p>
      <p style="margin: 0; font-size: 14px; color: #111;">
        ${escapeHtml(replyContent).replace(/\n/g, '<br>')}
      </p>
    </div>

    <div style="margin: 25px 0;">
      <a href="${escapeHtml(shareUrl)}" style="display: inline-block; background: #667eea; color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: 500;">
        View Conversation
      </a>
    </div>

    <p style="font-size: 12px; color: #999; margin: 25px 0 0 0;">
      You received this because you opted in to email notifications.
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
    ? `Project Approved: ${projectTitle} - Final Version Ready`
    : `Video Approved: ${projectTitle} - ${approvedVideos[0]?.name || 'New Video'}`
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <div style="font-size: 48px; margin-bottom: 10px;">🎉</div>
    <h1 style="margin: 0; font-size: 28px;">${companyName}</h1>
    <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Project Approved!</p>
  </div>
  
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px; margin-top: 0;">Hi ${clientName},</p>
    
    <p style="font-size: 16px;">Congratulations! Your project has been marked as approved:</p>
    
    <div style="background: white; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <h2 style="margin: 0 0 10px 0; color: #10b981; font-size: 20px;">${projectTitle}</h2>
      <p style="margin: 0; font-size: 16px; color: #666;">
        Status: <strong style="color: #10b981;">Approved ✓</strong>
      </p>
      ${approvedVideos.length > 0 ? `
        <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #666; font-weight: 600;">Approved Videos:</p>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #666;">
            ${approvedVideos.map(v => `<li style="margin: 3px 0;">${escapeHtml(v.name)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>

    <p style="font-size: 16px;">${isComplete ? 'All videos are now approved and' : 'The approved video is'} ready to download without watermarks!</p>
    
    <div style="background: #d1fae5; border: 2px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 5px; text-align: center;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #065f46; font-weight: 600;">
        ✨ Final Version Features:
      </p>
      <ul style="list-style: none; padding: 0; margin: 0; font-size: 14px; color: #065f46;">
        <li style="margin: 5px 0;">✓ No watermarks</li>
        <li style="margin: 5px 0;">✓ Full resolution</li>
        <li style="margin: 5px 0;">✓ Ready for production</li>
      </ul>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${shareUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.2);">
        Download Final Version
      </a>
    </div>
    
    <p style="font-size: 14px; color: #666; text-align: center; margin-top: 30px;">
      Thank you for working with us! We hope you're happy with the final result.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; margin-bottom: 0;">
      This is an automated message from ${companyName}. If you have any questions, please reply to this email.
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
 * Email template: New client feedback (to admin)
 */
export async function sendAdminNewFeedbackEmail({
  adminEmails,
  clientName,
  projectTitle,
  commentContent,
  timestamp,
  versionLabel,
}: {
  adminEmails: string[]
  clientName: string
  projectTitle: string
  commentContent: string
  timestamp?: number
  versionLabel?: string
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'Studio'
  const appDomain = settings.appDomain

  if (!appDomain) {
    throw new Error('App domain not configured. Please configure domain in Settings to enable email notifications.')
  }

  const subject = `New Client Feedback: ${escapeHtml(projectTitle)}`
  
  const timestampText = timestamp !== null && timestamp !== undefined
    ? `<p style="margin: 5px 0; font-size: 14px; color: #f59e0b;">
        <strong>⏱ Timestamp:</strong> ${escapeHtml(Math.floor(timestamp / 60) + ':' + Math.floor(timestamp % 60).toString().padStart(2, '0'))}
       </p>`
    : ''

  const versionText = versionLabel 
    ? `<p style="margin: 5px 0; font-size: 14px; color: #666;">
        <strong>Version:</strong> ${escapeHtml(versionLabel)}
       </p>`
    : ''
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 28px;">${escapeHtml(companyName)}</h1>
    <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">💬 New Client Feedback</p>
  </div>
  
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px; margin-top: 0;">New feedback received!</p>
    
    <div style="background: white; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <h2 style="margin: 0 0 10px 0; color: #f59e0b; font-size: 20px;">${escapeHtml(projectTitle)}</h2>
      <p style="margin: 5px 0; font-size: 14px; color: #666;">
        <strong>From:</strong> ${escapeHtml(clientName)}
      </p>
      ${versionText}
      ${timestampText}
    </div>
    
    <div style="background: #fef3c7; border: 2px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <p style="margin: 0 0 5px 0; font-size: 12px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Client's Feedback:</p>
      <p style="margin: 0; font-size: 15px; color: #78350f; white-space: pre-wrap;">
        ${escapeHtml(commentContent).replace(/\n/g, '<br>')}
      </p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${escapeHtml(appDomain)}/admin" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-size: 16px; font-weight: 600;">
        View in Admin Panel
      </a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; margin-bottom: 0;">
      This is an automated notification from ${companyName}.
    </p>
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
}: {
  adminEmails: string[]
  clientName: string
  projectTitle: string
  approvedVideos?: Array<{ name: string; id: string }>
  isComplete?: boolean
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'Studio'
  const appDomain = settings.appDomain

  if (!appDomain) {
    throw new Error('App domain not configured. Please configure domain in Settings to enable email notifications.')
  }

  const subject = isComplete
    ? `Project Approved by Client: ${projectTitle}`
    : `Video Approved by Client: ${projectTitle} - ${approvedVideos[0]?.name || 'New Video'}`
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <div style="font-size: 48px; margin-bottom: 10px;">🎉</div>
    <h1 style="margin: 0; font-size: 28px;">${companyName}</h1>
    <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Client Approved Project!</p>
  </div>
  
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 18px; margin-top: 0;">Great news! A project has been approved:</p>
    
    <div style="background: white; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 5px;">
      <h2 style="margin: 0 0 10px 0; color: #10b981; font-size: 20px;">${projectTitle}</h2>
      <p style="margin: 5px 0; font-size: 14px; color: #666;">
        <strong>Client:</strong> ${clientName}
      </p>
      ${approvedVideos.length > 0 ? `
        <div style="margin-top: 10px;">
          <p style="margin: 5px 0; font-size: 14px; color: #666; font-weight: 600;">Approved Videos:</p>
          <ul style="margin: 5px 0; padding-left: 20px; font-size: 14px; color: #666;">
            ${approvedVideos.map(v => `<li style="margin: 2px 0;">${escapeHtml(v.name)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      <p style="margin: 10px 0 5px 0; font-size: 14px; color: #10b981; font-weight: 600;">
        ✓ Status: ${isComplete ? 'All Videos Approved' : 'Video Approved'}
      </p>
    </div>
    
    <div style="background: #d1fae5; border: 2px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 5px; text-align: center;">
      <p style="margin: 0; font-size: 14px; color: #065f46;">
        The final version without watermarks is now available for the client to download.
      </p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${appDomain}/admin" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 5px; font-size: 16px; font-weight: 600;">
        View in Admin Panel
      </a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; margin-bottom: 0;">
      This is an automated notification from ${companyName}.
    </p>
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
