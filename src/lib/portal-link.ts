import crypto from 'crypto'
import { getRedis, consumeTokenAtomically } from './redis'
import { prisma } from './db'
import { sendEmail, getEmailSettings, getEmailBrand, renderEmailShell, escapeHtml, renderEmailButton, buildBrandingLogoUrl, type EmailHeaderStyle } from './email'
import { loadLocaleMessages } from '@/i18n/locale'
import { getRecipientLocale } from './email'

const TOKEN_PREFIX = 'portal_link:'
export const PORTAL_LINK_TTL_SECONDS = 5 * 60

export interface PortalLinkRecord {
  email: string
  ipHash: string
  uaHash: string
}

export function hashIpUa(ip: string, ua: string): { ipHash: string; uaHash: string } {
  const ipHash = crypto.createHash('sha256').update(ip || '').digest('hex').slice(0, 32)
  const uaHash = crypto.createHash('sha256').update(ua || '').digest('hex').slice(0, 32)
  return { ipHash, uaHash }
}

export async function createPortalLinkToken(params: {
  email: string
  ipHash: string
  uaHash: string
}): Promise<string> {
  const redis = getRedis()
  const token = crypto.randomBytes(32).toString('base64url')
  const record: PortalLinkRecord = {
    email: params.email.toLowerCase().trim(),
    ipHash: params.ipHash,
    uaHash: params.uaHash,
  }
  await redis.setex(`${TOKEN_PREFIX}${token}`, PORTAL_LINK_TTL_SECONDS, JSON.stringify(record))
  return token
}

export type ConsumePortalLinkResult =
  | { status: 'ok'; record: PortalLinkRecord }
  | { status: 'invalid' }            // token not found, malformed, or already consumed
  | { status: 'mismatch'; email: string } // token exists but IP/UA bindings don't match

export async function consumePortalLinkToken(params: {
  token: string
  ipHash: string
  uaHash: string
}): Promise<ConsumePortalLinkResult> {
  const redis = getRedis()
  const key = `${TOKEN_PREFIX}${params.token}`
  const raw = await redis.get(key)
  if (!raw) return { status: 'invalid' }

  let record: PortalLinkRecord
  try {
    record = JSON.parse(raw)
  } catch {
    await redis.del(key)
    return { status: 'invalid' }
  }

  if (record.ipHash !== params.ipHash || record.uaHash !== params.uaHash) {
    return { status: 'mismatch', email: record.email }
  }

  // Atomic single-use consumption — prevents race between two near-simultaneous clicks.
  const consumed = await consumeTokenAtomically(redis, key, raw)
  if (!consumed) return { status: 'invalid' }

  return { status: 'ok', record }
}

export async function emailHasAnyRecipient(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim()
  const row = await prisma.projectRecipient.findFirst({
    where: {
      email: { equals: normalized, mode: 'insensitive' },
    },
    select: { id: true },
  })
  return !!row
}

export async function sendPortalMagicLinkEmail(params: {
  email: string
  magicLinkUrl: string
}): Promise<void> {
  const settings = await getEmailSettings()
  const companyName = settings.companyName || 'ViTransfer'
  const brand = getEmailBrand(settings.accentColor)
  const brandingLogoUrl = buildBrandingLogoUrl(settings)
  const locale = await getRecipientLocale(params.email).catch(() => settings.language || 'en')
  const messages = await loadLocaleMessages(locale)
  const portalEmail = messages?.portal?.email || {}

  const subject = portalEmail.subject || `Sign in to ${companyName}`
  const title = portalEmail.title || 'Sign in to your projects'
  const preheader = portalEmail.preheader || `Use this link to sign in to ${companyName}`
  const intro = portalEmail.intro || `Click the button below to access the projects shared with you. This link will expire in ${PORTAL_LINK_TTL_SECONDS / 60} minutes and can only be used once.`
  const buttonLabel = portalEmail.button || 'Sign in'
  const ignoreNotice = portalEmail.ignoreNotice || "If you didn't request this email, you can safely ignore it."
  const linkFallback = portalEmail.linkFallback || 'If the button does not work, copy this link into your browser:'

  const button = renderEmailButton({ href: params.magicLinkUrl, label: buttonLabel, brand })

  const bodyContent = `
<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">${escapeHtml(intro)}</p>
<div style="text-align: center; margin: 24px 0;">${button}</div>
<p style="margin: 24px 0 8px 0; font-size: 13px; color: ${brand.muted};">${escapeHtml(linkFallback)}</p>
<p style="margin: 0 0 20px 0; font-size: 13px; word-break: break-all;"><a href="${escapeHtml(params.magicLinkUrl)}" style="color: ${brand.accent};">${escapeHtml(params.magicLinkUrl)}</a></p>
<p style="margin: 24px 0 0 0; font-size: 13px; color: ${brand.muted};">${escapeHtml(ignoreNotice)}</p>
`.trim()

  const html = renderEmailShell({
    companyName,
    title,
    preheader,
    brand,
    brandingLogoUrl,
    emailHeaderStyle: settings.emailHeaderStyle as EmailHeaderStyle,
    bodyContent,
  })

  const text = `${title}\n\n${intro}\n\n${params.magicLinkUrl}\n\n${ignoreNotice}`

  await sendEmail({
    to: params.email,
    subject,
    html,
    text,
  })
}
