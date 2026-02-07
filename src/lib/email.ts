import nodemailer from 'nodemailer'
import { prisma } from './db'
import { decrypt } from './encryption'
import { buildLogoSvg } from './brand'
import {
  getEmailTemplate,
  replacePlaceholders,
  type EmailTemplateType,
} from './email-template-system'

// Email header style options for branding
export type EmailHeaderStyle = 'NONE' | 'LOGO_ONLY' | 'NAME_ONLY' | 'LOGO_AND_NAME'

// Accent color presets (must match AppearanceSection.tsx)
const ACCENT_COLOR_HEX: Record<string, string> = {
  blue: '#007AFF',
  purple: '#8B5CF6',
  green: '#22C55E',
  orange: '#F97316',
  red: '#EF4444',
  pink: '#EC4899',
  teal: '#14B8A6',
  amber: '#F59E0B',
  stone: '#9d9487',
  gold: '#DEC091',
}

// Helper to generate a lighter tint of a color for backgrounds
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null
}

function getAccentSoftColors(accentHex: string): { bg: string; border: string } {
  const rgb = hexToRgb(accentHex)
  if (!rgb) return { bg: '#eff6ff', border: '#bfdbfe' }

  // Create a light tint for background (95% white blend)
  const bg = `rgb(${Math.round(rgb.r + (255 - rgb.r) * 0.9)}, ${Math.round(rgb.g + (255 - rgb.g) * 0.9)}, ${Math.round(rgb.b + (255 - rgb.b) * 0.9)})`
  // Create a medium tint for border (75% white blend)
  const border = `rgb(${Math.round(rgb.r + (255 - rgb.r) * 0.7)}, ${Math.round(rgb.g + (255 - rgb.g) * 0.7)}, ${Math.round(rgb.b + (255 - rgb.b) * 0.7)})`

  return { bg, border }
}

// Email brand colors type
export interface EmailBrandColors {
  accent: string
  accentGradient: string
  accentSoftBg: string
  accentSoftBorder: string
  surface: string
  surfaceAlt: string
  border: string
  text: string
  textSubtle: string
  muted: string
}

// Default brand colors (blue accent)
export const EMAIL_BRAND: EmailBrandColors = {
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
}

// Get dynamic email brand colors based on admin accent color setting
export function getEmailBrand(accentColor?: string | null): EmailBrandColors {
  const accentKey = accentColor || 'blue'
  const accentHex = ACCENT_COLOR_HEX[accentKey] || ACCENT_COLOR_HEX.blue
  const softColors = getAccentSoftColors(accentHex)

  // Generate a slightly darker shade for gradient start
  const rgb = hexToRgb(accentHex)
  const darkerHex = rgb
    ? `rgb(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 20)})`
    : accentHex

  return {
    accent: accentHex,
    accentGradient: `linear-gradient(135deg, ${darkerHex} 0%, ${accentHex} 100%)`,
    accentSoftBg: softColors.bg,
    accentSoftBorder: softColors.border,
    surface: '#ffffff',
    surfaceAlt: '#f9fafb',
    border: '#e5e7eb',
    text: '#111827',
    textSubtle: '#374151',
    muted: '#6b7280',
  }
}

/**
 * Process button syntax in template content
 * Converts {{BUTTON:Label:URL}} to styled HTML buttons
 * Uses table-based layout for Outlook compatibility
 */
export function processButtonSyntax(content: string, brand: EmailBrandColors): string {
  return content.replace(/\{\{BUTTON:([^:}]+):([^}]+)\}\}/g, (_, label, url) => {
    return renderEmailButton({
      href: url.trim(),
      label: label.trim(),
      brand,
    })
  })
}

/**
 * Process email template classes to inline styles
 * Converts class="info-box" etc to styled inline HTML
 * Uses table-based layouts for Outlook compatibility
 * 
 * IMPORTANT: Process inner elements first (info-label, info-value, spans),
 * then convert those divs to other tags, then process outer container boxes.
 */
export function processEmailClasses(content: string, brand: EmailBrandColors): string {
  // STEP 1: Process inner inline elements first (these don't contain other elements)
  
  // Process accent-text class (for version labels etc)
  content = content.replace(
    /<span class="accent-text">([\s\S]*?)<\/span>/gi,
    `<span style="color:${brand.accent}; font-weight:600;">$1</span>`
  )

  // STEP 2: Process inner div elements that don't contain other divs
  // Convert info-label divs to <p> tags so they don't interfere with outer box matching
  
  // Handle info-label with additional inline styles - merge them
  content = content.replace(
    /<div class="info-label" style="([^"]*)">([\s\S]*?)<\/div>/gi,
    `<p style="font-size:12px; font-weight:bold; color:${brand.muted}; margin:0 0 8px 0; text-transform:uppercase; letter-spacing:0.12em; $1">$2</p>`
  )
  
  // Handle info-label without additional styles
  content = content.replace(
    /<div class="info-label">([\s\S]*?)<\/div>/gi,
    `<p style="font-size:12px; font-weight:bold; color:${brand.muted}; margin:0 0 8px 0; text-transform:uppercase; letter-spacing:0.12em;">$1</p>`
  )

  // Process info-value class - convert to <p> tag
  content = content.replace(
    /<div class="info-value">([\s\S]*?)<\/div>/gi,
    `<p style="font-size:15px; color:${brand.text}; margin:0; padding:4px 0;">$1</p>`
  )

  // STEP 3: Now process container boxes (info-box, secondary-box, etc.)
  // These can now be matched correctly since inner divs with classes are converted to <p> tags
  
  // Process info-box with additional inline styles (e.g., style="text-align: center;")
  content = content.replace(
    /<div class="info-box" style="([^"]*)">([\s\S]*?)<\/div>/gi,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td bgcolor="${brand.accentSoftBg}" style="background-color:${brand.accentSoftBg}; border:1px solid ${brand.accentSoftBorder}; border-radius:10px; padding:16px; $1">$2</td>
      </tr>
    </table>`
  )

  // Process info-box class without additional styles
  content = content.replace(
    /<div class="info-box">([\s\S]*?)<\/div>/gi,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td bgcolor="${brand.accentSoftBg}" style="background-color:${brand.accentSoftBg}; border:1px solid ${brand.accentSoftBorder}; border-radius:10px; padding:16px;">$1</td>
      </tr>
    </table>`
  )

  // Process secondary-box class (neutral background)
  content = content.replace(
    /<div class="secondary-box">([\s\S]*?)<\/div>/gi,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td bgcolor="${brand.surfaceAlt}" style="background-color:${brand.surfaceAlt}; border:1px solid ${brand.border}; border-radius:10px; padding:16px;">$1</td>
      </tr>
    </table>`
  )

  // Process protected-note class
  content = content.replace(
    /<div class="protected-note">([\s\S]*?)<\/div>/gi,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td bgcolor="${brand.surfaceAlt}" style="background-color:${brand.surfaceAlt}; border:1px solid ${brand.border}; border-radius:10px; padding:14px; font-size:14px; color:${brand.textSubtle}; line-height:1.5;">$1</td>
      </tr>
    </table>`
  )

  // Process success-box class
  content = content.replace(
    /<div class="success-box">([\s\S]*?)<\/div>/gi,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td bgcolor="#dcfce7" style="background-color:#dcfce7; border:1px solid #86efac; border-radius:10px; padding:14px; font-size:14px; color:#15803d; line-height:1.5;">$1</td>
      </tr>
    </table>`
  )

  // Process warning-box class
  content = content.replace(
    /<div class="warning-box">([\s\S]*?)<\/div>/gi,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td bgcolor="#fef9c3" style="background-color:#fef9c3; border:1px solid #fde047; border-radius:10px; padding:14px; font-size:14px; color:#a16207; line-height:1.5;">$1</td>
      </tr>
    </table>`
  )

  // STEP 4: Process inline paragraph formatting
  content = content.replace(
    /<p style="margin: 0">/gi,
    `<p style="margin:0 0 16px 0; font-size:15px; color:${brand.textSubtle}; line-height:1.6;">`
  )

  // Convert plain newlines to breaks for basic formatting
  content = content.replace(/\n\n/g, '</p><p style="margin:0 0 16px 0; font-size:15px; color:' + brand.textSubtle + '; line-height:1.6;">')

  return content
}

/**
 * Process custom template content with placeholder values and styling
 */
export function processTemplateContent(
  content: string,
  values: Record<string, string>,
  brand: EmailBrandColors,
  logoUrl?: string | null
): string {
  // Replace placeholders
  let processed = replacePlaceholders(content, values)
  
  // Process {{LOGO}} placeholder - replace with inline image
  if (logoUrl) {
    const logoHtml = `<img src="${logoUrl}" alt="Logo" height="44" style="display:inline-block; border:0; outline:none; text-decoration:none; height:44px; width:auto; max-width:200px; vertical-align:middle;" />`
    processed = processed.replace(/\{\{LOGO\}\}/g, logoHtml)
  } else {
    // Remove {{LOGO}} placeholder if no logo is configured
    processed = processed.replace(/\{\{LOGO\}\}/g, '')
  }
  
  // Process button syntax
  processed = processButtonSyntax(processed, brand)
  // Process CSS classes to inline styles
  processed = processEmailClasses(processed, brand)
  return processed
}

// Inline SVG logo for emails (accent-aware, reuses app logomark)
// Note: Some email clients strip SVGs, but this is used as fallback for default logo
function buildEmailLogo(accentHex: string): string {
  const accent = accentHex || ACCENT_COLOR_HEX.blue
  // Reuse the same SVG used across the app; size 56 for email header balance.
  return buildLogoSvg(accent, 56)
}

/**
 * Build the branding logo URL for emails
 * Uses PNG endpoint which serves custom logo or default logo with accent color
 */
export function buildBrandingLogoUrl(settings: EmailSettings): string {
  const base = settings.appDomain?.replace(/\/$/, '') || ''
  // PNG endpoint serves custom logo if uploaded, otherwise default logo with accent color
  return base ? `${base}/api/branding/logo-png` : '/api/branding/logo-png'
}

export function renderEmailButton({
  href,
  label,
  variant = 'primary',
  align = 'center',
  brand = EMAIL_BRAND,
}: {
  href: string
  label: string
  variant?: 'primary' | 'secondary'
  align?: 'left' | 'center' | 'right'
  brand?: EmailBrandColors
}): string {
  const backgroundColor = variant === 'primary' ? brand.accent : brand.surfaceAlt
  const textColor = variant === 'primary' ? '#ffffff' : brand.textSubtle
  const borderStyle = variant === 'primary' ? 'none' : `1px solid ${brand.border}`
  // Generate shadow color from accent
  const shadowColor = variant === 'primary' ? `${brand.accent}40` : 'transparent'
  const shadowStyle = variant === 'primary' ? `0 4px 12px ${shadowColor}` : 'none'

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

export function renderUnsubscribeSection(unsubscribeUrl: string, brand = EMAIL_BRAND): string {
  return `
    <div style="margin: 28px 0 0; padding-top: 18px; border-top: 1px solid ${brand.border}; text-align: center;">
      ${renderEmailButton({ href: unsubscribeUrl, label: 'Unsubscribe', variant: 'secondary', brand })}
      <p style="margin: 10px 0 0; font-size: 12px; color: ${brand.muted}; line-height: 1.5;">
        Stops email notifications only. Your share link still works.
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
  brand?: EmailBrandColors
  brandingLogoUrl?: string | null
  emailHeaderStyle?: EmailHeaderStyle
}

export function renderEmailShell({
  companyName,
  title,
  subtitle,
  bodyContent,
  footerNote,
  preheader,
  brand = EMAIL_BRAND,
  brandingLogoUrl,
  emailHeaderStyle = 'LOGO_AND_NAME',
}: EmailShellOptions) {
  const safeCompanyName = escapeHtml(companyName)
  const safeTitle = escapeHtml(title)
  const safeSubtitle = subtitle ? escapeHtml(subtitle) : ''
  const safePreheader = preheader ? escapeHtml(preheader) : ''
  
  // Logo is always available now (PNG endpoint serves custom or default with accent color)
  const logo = brandingLogoUrl
    ? `<img src="${escapeHtml(brandingLogoUrl)}" alt="${safeCompanyName}" height="44" width="auto" style="display:block; border:0; outline:none; text-decoration:none; height:44px; width:auto; max-width:132px;" />`
    : ''
  
  // Determine what to show based on emailHeaderStyle
  const showLogo = (emailHeaderStyle === 'LOGO_ONLY' || emailHeaderStyle === 'LOGO_AND_NAME') && logo
  const showCompanyName = emailHeaderStyle === 'NAME_ONLY' || emailHeaderStyle === 'LOGO_AND_NAME'
  const showBrandingPill = emailHeaderStyle !== 'NONE' && (showLogo || showCompanyName)

  // Build the branding pill using table layout (Outlook compatible)
  // Using a semi-transparent white overlay effect with solid fallback color
  const pillBgColor = '#ffffff'
  const brandingPillContent = showBrandingPill ? `
              <!--[if mso]>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:14px;">
                <tr>
                  <td style="background-color:${pillBgColor}; padding:10px 14px; border-radius:8px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        ${showLogo ? `<td style="padding-right:${showCompanyName ? '12' : '0'}px; vertical-align:middle;">${logo}</td>` : ''}
                        ${showCompanyName ? `<td style="vertical-align:middle;"><span style="font-size:17px; font-weight:bold; color:${brand.accent}; line-height:1.1;">${safeCompanyName}</span></td>` : ''}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <![endif]-->
              <!--[if !mso]><!-->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 14px auto;">
                <tr>
                  <td style="background-color:rgba(255,255,255,0.15); padding:10px 14px; border-radius:14px; border:1px solid rgba(255,255,255,0.2);">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        ${showLogo ? `<td style="padding-right:${showCompanyName ? '12' : '0'}px; vertical-align:middle;">${logo}</td>` : ''}
                        ${showCompanyName ? `<td style="vertical-align:middle;"><span style="font-size:17px; font-weight:bold; color:#ffffff; line-height:1.1;">${safeCompanyName}</span></td>` : ''}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!--<![endif]-->` : ''

  return `
<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if mso]>
  <xml>
    <o:OfficeDocumentSettings>
      <o:AllowPNG/>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml>
  <![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  ${preheader ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; mso-hide:all;">${safePreheader}</div>` : ''}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <!--[if mso]>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center">
          <tr>
            <td>
        <![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px; background-color:${brand.surface}; border:1px solid ${brand.border};">
          <!-- Header with accent background -->
          <tr>
            <td align="center" bgcolor="${brand.accent}" style="background-color:${brand.accent}; padding:30px 24px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
              ${brandingPillContent}
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="font-size:24px; font-weight:bold; color:#ffffff; padding-bottom:8px;">${safeTitle}</td>
                </tr>
                ${subtitle ? `<tr><td align="center" style="font-size:15px; color:#ffffff; line-height:1.4;">${safeSubtitle}</td></tr>` : ''}
              </table>
            </td>
          </tr>
          <!-- Body content -->
          <tr>
            <td style="padding:28px 24px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color:${brand.textSubtle}; font-size:15px; line-height:1.6;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td bgcolor="${brand.surfaceAlt}" style="background-color:${brand.surfaceAlt}; padding:18px 24px; border-top:1px solid ${brand.border}; text-align:center; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
              <span style="font-size:12px; color:${brand.muted}; line-height:1.5;">${escapeHtml(footerNote || companyName)}</span>
            </td>
          </tr>
        </table>
        <!--[if mso]>
            </td>
          </tr>
        </table>
        <![endif]-->
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
  accentColor: string | null
  brandingLogoPath: string | null
  emailHeaderStyle: string
}

let cachedSettings: EmailSettings | null = null
let settingsCacheTime: number = 0
const CACHE_DURATION = 30 * 1000 // 30 seconds (reduced for testing)

/**
 * Invalidate the email settings cache
 * Call this when settings are updated to ensure fresh data
 */
export function invalidateEmailSettingsCache(): void {
  cachedSettings = null
  settingsCacheTime = 0
}

/**
 * Get email settings from database with caching
 * @param forceRefresh - If true, bypasses cache and fetches fresh data
 */
export async function getEmailSettings(forceRefresh = false): Promise<EmailSettings> {
  const now = Date.now()
  
  // Return cached settings if still valid and not forcing refresh
  if (!forceRefresh && cachedSettings && (now - settingsCacheTime) < CACHE_DURATION) {
    return cachedSettings
  }

  // Fetch fresh settings
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
  })

  // Decrypt the password if it exists
  // Note: emailHeaderStyle is cast to handle pre-migration state
  cachedSettings = settings ? {
    smtpServer: settings.smtpServer,
    smtpPort: settings.smtpPort,
    smtpUsername: settings.smtpUsername,
    smtpPassword: settings.smtpPassword ? decrypt(settings.smtpPassword) : null,
    smtpFromAddress: settings.smtpFromAddress,
    smtpSecure: settings.smtpSecure,
    appDomain: settings.appDomain,
    companyName: settings.companyName,
    accentColor: settings.accentColor,
    brandingLogoPath: settings.brandingLogoPath,
    emailHeaderStyle: (settings as { emailHeaderStyle?: string }).emailHeaderStyle || 'LOGO_AND_NAME',
  } : {
    smtpServer: null,
    smtpPort: null,
    smtpUsername: null,
    smtpPassword: null,
    smtpFromAddress: null,
    smtpSecure: null,
    appDomain: null,
    companyName: null,
    accentColor: null,
    brandingLogoPath: null,
    emailHeaderStyle: 'LOGO_AND_NAME',
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
  const brand = getEmailBrand(settings.accentColor)
  const brandingLogoUrl = buildBrandingLogoUrl(settings)

  // Get custom template or use default
  const template = await getEmailTemplate('NEW_VERSION')
  
  // Build placeholder values (use both CLIENT_NAME and RECIPIENT_NAME for flexibility)
  const placeholderValues: Record<string, string> = {
    '{{CLIENT_NAME}}': clientName,
    '{{RECIPIENT_NAME}}': clientName,
    '{{PROJECT_TITLE}}': projectTitle,
    '{{VIDEO_NAME}}': videoName,
    '{{VERSION_LABEL}}': versionLabel,
    '{{SHARE_URL}}': shareUrl,
    '{{COMPANY_NAME}}': companyName,
    '{{PASSWORD_NOTICE}}': '', // Will be handled separately
  }

  // Process subject line (replace placeholders)
  const subject = replacePlaceholders(template.subject, placeholderValues)

  // Process body content with placeholders, buttons, and inline styles
  let bodyContent = processTemplateContent(template.bodyContent, placeholderValues, brand, brandingLogoUrl)

  // Add password protected note if applicable
  if (isPasswordProtected) {
    bodyContent += `
      <div style="background: ${brand.surfaceAlt}; border: 1px solid ${brand.border}; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
        <div style="font-size: 14px; color: ${brand.textSubtle}; line-height: 1.5;">
          <strong>Protected project:</strong> Use the password sent separately to access this project.
        </div>
      </div>
    `
  }

  // Add unsubscribe section if applicable
  if (unsubscribeUrl) {
    bodyContent += renderUnsubscribeSection(unsubscribeUrl, brand)
  }

  const html = renderEmailShell({
    companyName,
    title: 'New Version Available',
    subtitle: 'Ready for your review',
    brand,
    brandingLogoUrl,
    emailHeaderStyle: settings.emailHeaderStyle as EmailHeaderStyle,
    bodyContent,
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
  approverName,
  isApprover = false,
  watermarkEnabled = true,
}: {
  clientEmail: string
  clientName: string
  projectTitle: string
  shareUrl: string
  approvedVideos?: Array<{ name: string; id: string }>
  isComplete?: boolean
  unsubscribeUrl?: string
  approverName?: string
  isApprover?: boolean
  watermarkEnabled?: boolean
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'ViTransfer'
  const brand = getEmailBrand(settings.accentColor)
  const brandingLogoUrl = buildBrandingLogoUrl(settings)

  // Get custom template or use default
  const template = await getEmailTemplate('PROJECT_APPROVED')

  const statusTitle = isComplete ? 'Project Approved' : 'Video Approved'
  const statusMessage = isComplete
    ? 'All videos are approved and ready to deliver'
    : `${approvedVideos[0]?.name || 'The video'} has been approved`

  const videoName = approvedVideos[0]?.name || 'The video'

  // Build dynamic approval message based on context
  let approvalMessage: string
  if (isComplete) {
    // Full project approval
    if (approverName && !isApprover) {
      // Someone else from the company approved
      approvalMessage = `<strong>${escapeHtml(approverName)}</strong> has approved all deliverables.`
    } else {
      // Recipient approved or unknown approver
      approvalMessage = `All deliverables have been approved.`
    }
    // Add download note based on watermark setting
    if (watermarkEnabled) {
      approvalMessage += ` You can now download the final version without watermarks.`
    } else {
      approvalMessage += ` The final files are now ready for download.`
    }
  } else {
    // Single video approval
    if (approverName && !isApprover) {
      approvalMessage = `<strong>${escapeHtml(approverName)}</strong> has approved this deliverable.`
    } else {
      approvalMessage = `This deliverable has been approved.`
    }
    if (watermarkEnabled) {
      approvalMessage += ` You can now download the final version without watermarks.`
    } else {
      approvalMessage += ` The final file is now ready for download.`
    }
  }

  // Build placeholder values
  const placeholderValues: Record<string, string> = {
    '{{CLIENT_NAME}}': clientName,
    '{{RECIPIENT_NAME}}': clientName,
    '{{PROJECT_TITLE}}': projectTitle,
    '{{VIDEO_NAME}}': videoName,
    '{{SHARE_URL}}': shareUrl,
    '{{COMPANY_NAME}}': companyName,
    '{{APPROVAL_MESSAGE}}': approvalMessage,
  }

  // Process subject line
  const subject = replacePlaceholders(template.subject, placeholderValues)

  // Process body content with placeholders, buttons, and inline styles
  let bodyContent = processTemplateContent(template.bodyContent, placeholderValues, brand, brandingLogoUrl)

  // Add unsubscribe section if applicable
  if (unsubscribeUrl) {
    bodyContent += renderUnsubscribeSection(unsubscribeUrl, brand)
  }

  const html = renderEmailShell({
    companyName,
    title: statusTitle,
    subtitle: statusMessage,
    brand,
    brandingLogoUrl,
    emailHeaderStyle: settings.emailHeaderStyle as EmailHeaderStyle,
    bodyContent,
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
  const brand = getEmailBrand(settings.accentColor)
  const brandingLogoUrl = buildBrandingLogoUrl(settings)

  // Get custom template or use default
  const template = await getEmailTemplate('COMMENT_NOTIFICATION')

  const timecodeText = timecode ? `at ${timecode}` : ''

  // Build placeholder values
  const placeholderValues: Record<string, string> = {
    '{{CLIENT_NAME}}': clientName,
    '{{RECIPIENT_NAME}}': clientName,
    '{{PROJECT_TITLE}}': projectTitle,
    '{{VIDEO_NAME}}': videoName,
    '{{VERSION_LABEL}}': versionLabel,
    '{{AUTHOR_NAME}}': authorName,
    '{{COMMENT_CONTENT}}': escapeHtml(commentContent),
    '{{TIMECODE}}': timecodeText,
    '{{SHARE_URL}}': shareUrl,
    '{{COMPANY_NAME}}': companyName,
  }

  // Process subject line
  const subject = replacePlaceholders(template.subject, placeholderValues)

  // Process body content with placeholders, buttons, and inline styles
  let bodyContent = processTemplateContent(template.bodyContent, placeholderValues, brand, brandingLogoUrl)

  // Add unsubscribe section if applicable
  if (unsubscribeUrl) {
    bodyContent += renderUnsubscribeSection(unsubscribeUrl, brand)
  }

  const html = renderEmailShell({
    companyName,
    title: 'New Comment',
    subtitle: `${videoName} in ${projectTitle}`,
    preheader: `New comment on ${videoName} in ${projectTitle}`,
    brand,
    brandingLogoUrl,
    emailHeaderStyle: settings.emailHeaderStyle as EmailHeaderStyle,
    bodyContent,
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
  const brand = getEmailBrand(settings.accentColor)
  const brandingLogoUrl = buildBrandingLogoUrl(settings)

  // Get custom template or use default
  const template = await getEmailTemplate('ADMIN_COMMENT_NOTIFICATION')

  const timecodeText = timecode ? `at ${timecode}` : ''
  const adminUrl = settings.appDomain ? `${settings.appDomain}/admin` : ''

  // Build placeholder values
  const placeholderValues: Record<string, string> = {
    '{{CLIENT_NAME}}': clientName,
    '{{RECIPIENT_NAME}}': 'Admin',
    '{{CLIENT_EMAIL}}': clientEmail || '',
    '{{PROJECT_TITLE}}': projectTitle,
    '{{VIDEO_NAME}}': videoName,
    '{{VERSION_LABEL}}': versionLabel,
    '{{COMMENT_CONTENT}}': escapeHtml(commentContent),
    '{{TIMECODE}}': timecodeText,
    '{{ADMIN_URL}}': adminUrl,
    '{{COMPANY_NAME}}': companyName,
  }

  // Process subject line
  const subject = replacePlaceholders(template.subject, placeholderValues)

  // Process body content with placeholders, buttons, and inline styles
  const bodyContent = processTemplateContent(template.bodyContent, placeholderValues, brand, brandingLogoUrl)

  const html = renderEmailShell({
    companyName,
    title: 'New Comment',
    subtitle: `${clientName} on ${videoName} in ${projectTitle}`,
    preheader: `New comment from ${clientName} on ${projectTitle}`,
    brand,
    brandingLogoUrl,
    emailHeaderStyle: settings.emailHeaderStyle as EmailHeaderStyle,
    bodyContent,
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
  const brand = getEmailBrand(settings.accentColor)
  const brandingLogoUrl = buildBrandingLogoUrl(settings)

  if (!appDomain) {
    throw new Error('App domain not configured. Please configure domain in Settings to enable email notifications.')
  }

  // Get custom template or use default
  const template = await getEmailTemplate('ADMIN_PROJECT_APPROVED')

  // Determine subject and title based on approval/unapproval and complete/partial
  const action = isApproval ? 'Approved' : 'Unapproved'
  const statusTitle = isComplete ? `All Deliverables ${action}` : `Video ${action}`
  const statusMessage = isComplete
    ? `${clientName} has ${isApproval ? 'approved' : 'unapproved'} all deliverables for this project`
    : `${clientName} has ${isApproval ? 'approved' : 'unapproved'} ${approvedVideos[0]?.name || 'a video'}`

  const videoName = approvedVideos[0]?.name || 'A video'

  // Build placeholder values
  const placeholderValues: Record<string, string> = {
    '{{CLIENT_NAME}}': clientName,
    '{{RECIPIENT_NAME}}': 'Admin',
    '{{PROJECT_TITLE}}': projectTitle,
    '{{VIDEO_NAME}}': videoName,
    '{{APPROVAL_STATUS}}': action,
    '{{APPROVAL_ACTION}}': isApproval ? 'approved' : 'unapproved',
    '{{ADMIN_URL}}': `${appDomain}/admin`,
    '{{COMPANY_NAME}}': companyName,
  }

  // Process subject line
  const subject = replacePlaceholders(template.subject, placeholderValues)

  // Process body content with placeholders, buttons, and inline styles
  const bodyContent = processTemplateContent(template.bodyContent, placeholderValues, brand, brandingLogoUrl)

  const html = renderEmailShell({
    companyName,
    title: statusTitle,
    subtitle: statusMessage,
    preheader: `${statusTitle}: ${projectTitle}`,
    brand,
    brandingLogoUrl,
    emailHeaderStyle: settings.emailHeaderStyle as EmailHeaderStyle,
    bodyContent,
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
  const brand = getEmailBrand(settings.accentColor)
  const brandingLogoUrl = buildBrandingLogoUrl(settings)

  // Get custom template or use default
  const template = await getEmailTemplate('PROJECT_GENERAL')

  // Build video list HTML
  const videoListHtml = readyVideos.length > 0 ? `
    <div style="background:${brand.surfaceAlt}; border:1px solid ${brand.border}; border-radius:10px; padding:16px; margin-bottom:24px;">
      <div style="font-size:12px; font-weight:700; color:${brand.muted}; margin-bottom:12px; text-transform:uppercase; letter-spacing:0.12em;">Ready to view</div>
      ${readyVideos.map(v => `
        <div style="font-size:15px; color:${brand.textSubtle}; padding:6px 0;">
          • ${escapeHtml(v.name)} <span style="color:${brand.accent}; font-weight:600;">${escapeHtml(v.versionLabel)}</span>
        </div>
      `).join('')}
    </div>
  ` : ''

  const passwordNotice = isPasswordProtected
    ? `<div style="background:${brand.surfaceAlt}; border:1px solid ${brand.border}; border-radius:10px; padding:14px 16px; font-size:14px; color:${brand.textSubtle}; margin:0 0 24px;">
        <strong>Protected project:</strong> Use the password sent separately to access this project.
      </div>`
    : ''

  // Build placeholder values
  const placeholderValues: Record<string, string> = {
    '{{CLIENT_NAME}}': clientName,
    '{{RECIPIENT_NAME}}': clientName,
    '{{PROJECT_TITLE}}': projectTitle,
    '{{PROJECT_DESCRIPTION}}': projectDescription || '',
    '{{SHARE_URL}}': shareUrl,
    '{{COMPANY_NAME}}': companyName,
    '{{VIDEO_LIST}}': videoListHtml,
    '{{PASSWORD_NOTICE}}': passwordNotice,
  }

  // Process subject line
  const subject = replacePlaceholders(template.subject, placeholderValues)

  // Process body content with placeholders, buttons, and inline styles
  let bodyContent = processTemplateContent(template.bodyContent, placeholderValues, brand, brandingLogoUrl)

  // Add unsubscribe section if applicable
  if (unsubscribeUrl) {
    bodyContent += renderUnsubscribeSection(unsubscribeUrl, brand)
  }

  const html = renderEmailShell({
    companyName,
    title: 'Ready for Review',
    subtitle: projectTitle,
    preheader: `Ready for review: ${projectTitle}`,
    brand,
    brandingLogoUrl,
    emailHeaderStyle: settings.emailHeaderStyle as EmailHeaderStyle,
    bodyContent,
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
  const brand = getEmailBrand(settings.accentColor)
  const brandingLogoUrl = buildBrandingLogoUrl(settings)

  // Get custom template or use default
  const template = await getEmailTemplate('PASSWORD')

  // Build placeholder values
  const placeholderValues: Record<string, string> = {
    '{{CLIENT_NAME}}': clientName,
    '{{RECIPIENT_NAME}}': clientName,
    '{{PROJECT_TITLE}}': projectTitle,
    '{{PASSWORD}}': password,
    '{{COMPANY_NAME}}': companyName,
  }

  // Process subject line
  const subject = replacePlaceholders(template.subject, placeholderValues)

  // Process body content with placeholders, buttons, and inline styles
  let bodyContent = processTemplateContent(template.bodyContent, placeholderValues, brand, brandingLogoUrl)

  // Add unsubscribe section if applicable
  if (unsubscribeUrl) {
    bodyContent += renderUnsubscribeSection(unsubscribeUrl, brand)
  }

  const html = renderEmailShell({
    companyName,
    title: 'Project Password',
    subtitle: projectTitle,
    preheader: `Password for ${projectTitle}`,
    brand,
    brandingLogoUrl,
    emailHeaderStyle: settings.emailHeaderStyle as EmailHeaderStyle,
    bodyContent,
  })

  return sendEmail({
    to: clientEmail,
    subject,
    html,
  })
}

/**
 * Email template: Admin password reset
 */
export async function sendPasswordResetEmail({
  adminEmail,
  adminName,
  resetUrl,
}: {
  adminEmail: string
  adminName: string
  resetUrl: string
}) {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'ViTransfer'
  const brand = getEmailBrand(settings.accentColor)
  const brandingLogoUrl = buildBrandingLogoUrl(settings)

  // Get custom template or use default
  const template = await getEmailTemplate('PASSWORD_RESET')

  // Build placeholder values
  const placeholderValues: Record<string, string> = {
    '{{RECIPIENT_NAME}}': adminName,
    '{{RESET_URL}}': resetUrl,
    '{{COMPANY_NAME}}': companyName,
    '{{EXPIRY_TIME}}': '30 minutes',
  }

  // Process subject line
  const subject = replacePlaceholders(template.subject, placeholderValues)

  // Process body content with placeholders, buttons, and inline styles
  const bodyContent = processTemplateContent(template.bodyContent, placeholderValues, brand, brandingLogoUrl)

  const html = renderEmailShell({
    companyName,
    title: 'Password Reset',
    subtitle: 'Reset your admin account password',
    preheader: 'Reset your password for ViTransfer',
    brand,
    brandingLogoUrl,
    emailHeaderStyle: settings.emailHeaderStyle as EmailHeaderStyle,
    bodyContent,
    footerNote: `This is an automated security message from ${companyName}`,
  })

  return sendEmail({
    to: adminEmail,
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
    const brand = getEmailBrand(settings.accentColor)
    const brandingLogoUrl = buildBrandingLogoUrl(settings)

    // Verify connection
    await transporter.verify()

    // Send test email
    const html = renderEmailShell({
      companyName: settings.companyName || 'ViTransfer',
      title: 'SMTP Test Succeeded',
      subtitle: 'Email sending is working',
      preheader: 'SMTP configuration is working',
      brand,
      brandingLogoUrl,
      emailHeaderStyle: settings.emailHeaderStyle as EmailHeaderStyle,
      bodyContent: `
        <p style="font-size:15px; color:${brand.textSubtle}; line-height:1.6; margin:0 0 12px;">
          Your SMTP configuration is working. Details below for your records.
        </p>
        <div style="border:1px solid ${brand.border}; border-radius:10px; padding:14px 16px; background:${brand.surfaceAlt};">
          <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${brand.muted}; margin-bottom:8px; font-weight:700;">Connection details</div>
          <div style="font-size:14px; color:${brand.text}; line-height:1.6;">
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
