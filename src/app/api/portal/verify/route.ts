import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIpAddress } from '@/lib/utils'
import { consumePortalLinkToken, hashIpUa } from '@/lib/portal-link'
import { signPortalSession } from '@/lib/portal-token'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logSecurityEvent } from '@/lib/video-access'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderErrorPage(heading: string, message: string, retryHref: string, retryLabel: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(heading)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html,body{height:100%;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#0a0a0a;color:#f5f5f5;}
  .wrap{display:flex;align-items:center;justify-content:center;height:100%;padding:24px;}
  .card{max-width:420px;width:100%;background:#171717;border:1px solid #262626;border-radius:12px;padding:32px;text-align:center;}
  h1{font-size:20px;margin:0 0 12px;}
  p{font-size:14px;line-height:1.5;color:#a3a3a3;margin:0 0 20px;}
  a{display:inline-block;background:#3b82f6;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;}
</style></head>
<body><div class="wrap"><div class="card">
  <h1>${escapeHtml(heading)}</h1>
  <p>${escapeHtml(message)}</p>
  <a href="${escapeHtml(retryHref)}">${escapeHtml(retryLabel)}</a>
</div></div></body></html>`
}

function renderSuccessPage(token: string): string {
  // Token is base64url-encoded JWT — safe to embed inside a JSON.stringify wrapper.
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Signing in…</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html,body{height:100%;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#0a0a0a;color:#f5f5f5;}
  .wrap{display:flex;align-items:center;justify-content:center;height:100%;}
  p{font-size:14px;color:#a3a3a3;}
</style></head>
<body><div class="wrap"><p>Signing you in…</p></div>
<script>
(function(){
  try {
    localStorage.setItem('portal_session', ${JSON.stringify(token)});
  } catch(e) {}
  window.location.replace('/portal');
})();
</script></body></html>`
}

export async function GET(request: NextRequest) {
  try {
    const locale = await getConfiguredLocale()
    const messages = await loadLocaleMessages(locale)
    const portalMessages = messages?.portal || {}

    const ipAddress = getClientIpAddress(request)

    const limit = await rateLimit(request, {
      windowMs: 15 * 60 * 1000,
      maxRequests: 20,
      message: portalMessages.tooManyRequests || 'Too many requests. Please try again later.',
    }, 'portal-verify-ip')
    if (limit) {
      await logSecurityEvent({
        type: 'PORTAL_LINK_RATE_LIMIT_HIT',
        severity: 'WARNING',
        ipAddress,
        details: { scope: 'verify-ip' },
        wasBlocked: true,
      })
      return new NextResponse(
        renderErrorPage(
          portalMessages.tooManyRequestsTitle || 'Too many attempts',
          portalMessages.tooManyRequests || 'Too many requests. Please try again later.',
          '/portal',
          portalMessages.backToPortal || 'Back to sign-in'
        ),
        { status: 429, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )
    }

    const url = new URL(request.url)
    const token = url.searchParams.get('t') || ''

    const linkExpiredHtml = renderErrorPage(
      portalMessages.linkExpiredTitle || 'Link expired or invalid',
      portalMessages.linkExpiredBody || 'This sign-in link is no longer valid. Please request a new one.',
      '/portal',
      portalMessages.requestNewLink || 'Request a new link'
    )

    if (!token || token.length > 256) {
      return new NextResponse(linkExpiredHtml, {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const ua = request.headers.get('user-agent') || ''
    const { ipHash, uaHash } = hashIpUa(ipAddress, ua)

    const result = await consumePortalLinkToken({ token, ipHash, uaHash })

    if (result.status === 'mismatch') {
      // Token is real but bound to a different IP/UA. Strong signal of token theft
      // or an unusual roaming pattern — log even though we return the same generic page.
      await logSecurityEvent({
        type: 'PORTAL_LINK_DEVICE_MISMATCH',
        severity: 'WARNING',
        ipAddress,
        details: { email: result.email },
        wasBlocked: true,
      })
      return new NextResponse(linkExpiredHtml, {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    if (result.status === 'invalid') {
      // Expired / never-existed / lost-the-race. Don't log — would flood the audit
      // log on every benign expired-link click.
      return new NextResponse(linkExpiredHtml, {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const session = await signPortalSession(result.record.email)

    await logSecurityEvent({
      type: 'PORTAL_LINK_VERIFIED',
      severity: 'INFO',
      ipAddress,
      sessionId: session.sessionId,
      details: { email: result.record.email },
      wasBlocked: false,
    })

    return new NextResponse(renderSuccessPage(session.token), {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    })
  } catch (error) {
    logError('[PORTAL] verify error:', error)
    return new NextResponse(
      renderErrorPage(
        'Sign-in failed',
        'Something went wrong while signing you in. Please request a new link.',
        '/portal',
        'Back to sign-in'
      ),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }
}
