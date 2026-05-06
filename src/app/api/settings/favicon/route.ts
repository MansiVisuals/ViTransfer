import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { initStorage, uploadFile, deleteFile } from '@/lib/storage'
import { rateLimit } from '@/lib/rate-limit'
import { prisma } from '@/lib/db'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'
import DOMPurify from 'isomorphic-dompurify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Favicons are small. 100 KB is plenty even for a multi-resolution .ico bundle.
const MAX_SIZE_BYTES = 100 * 1024

// Storage paths per format. Only one is ever populated; the previous file is
// removed when the format changes (e.g. user replaces a .png with a .svg).
const FAVICON_PATHS = {
  svg: 'branding/favicon.svg',
  png: 'branding/favicon.png',
  ico: 'branding/favicon.ico',
} as const
type FaviconExt = keyof typeof FAVICON_PATHS

// Magic-byte signatures used for content verification (defends against the
// browser sending an SVG masqueraded as a PNG, etc.).
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ICO_MAGIC = Buffer.from([0x00, 0x00, 0x01, 0x00])

function detectFaviconKind(contentType: string, head: Buffer): FaviconExt | null {
  if (contentType.includes('image/svg+xml')) {
    const leading = head.slice(0, 256).toString('utf-8').trimStart().toLowerCase()
    if (leading.startsWith('<svg') || leading.startsWith('<?xml')) return 'svg'
    return null
  }
  if (contentType.includes('image/png')) {
    return head.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC) ? 'png' : null
  }
  if (
    contentType.includes('image/x-icon') ||
    contentType.includes('image/vnd.microsoft.icon') ||
    contentType.includes('image/ico')
  ) {
    return head.subarray(0, ICO_MAGIC.length).equals(ICO_MAGIC) ? 'ico' : null
  }
  return null
}

/**
 * Sanitize SVG using the same strict allow-list as the logo upload. SVGs are
 * the only favicon format with XSS risk (they can carry <script>); PNG and ICO
 * are binary and safe to store as-is.
 */
function sanitizeSvg(svgText: string): string | null {
  const clean = DOMPurify.sanitize(svgText, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ALLOWED_TAGS: [
      'svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline',
      'polygon', 'ellipse', 'text', 'tspan', 'defs', 'clipPath',
      'linearGradient', 'radialGradient', 'stop', 'mask', 'symbol', 'use',
      'title', 'desc', 'marker',
    ],
    ALLOWED_ATTR: [
      'viewBox', 'xmlns', 'xmlns:xlink', 'd', 'fill', 'stroke', 'stroke-width',
      'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
      'transform', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height',
      'rx', 'ry', 'points', 'id', 'class', 'opacity', 'fill-opacity',
      'stroke-opacity', 'fill-rule', 'clip-rule', 'clip-path',
      'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
      'x1', 'y1', 'x2', 'y2', 'font-size', 'font-family', 'font-weight',
      'text-anchor', 'dominant-baseline', 'letter-spacing',
      'marker-start', 'marker-mid', 'marker-end', 'markerWidth', 'markerHeight',
      'refX', 'refY', 'orient', 'markerUnits',
      'href', 'xlink:href',
    ],
    ALLOW_DATA_ATTR: false,
  })
  if (!clean || !clean.trim().toLowerCase().startsWith('<svg')) return null
  return clean
}

async function removeAllFaviconFiles(): Promise<void> {
  for (const path of Object.values(FAVICON_PATHS)) {
    try { await deleteFile(path) } catch { /* ignore missing */ }
  }
}

export async function POST(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const settingsMessages = messages?.settings || {}

  const auth = await requireApiAdmin(request)
  if (auth instanceof Response) return auth

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: settingsMessages.tooManyRequestsSlowDown || 'Too many requests. Please slow down.',
  }, 'settings-favicon-upload', auth.id)
  if (rateLimitResult) return rateLimitResult

  const contentType = (request.headers.get('content-type') || '').toLowerCase()
  const buffer = Buffer.from(await request.arrayBuffer())

  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: settingsMessages.faviconEmpty || 'Empty file' }, { status: 400 })
  }
  if (buffer.byteLength > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: settingsMessages.faviconTooLarge || 'Favicon too large (max 100 KB)' }, { status: 400 })
  }

  const kind = detectFaviconKind(contentType, buffer)
  if (!kind) {
    return NextResponse.json({ error: settingsMessages.faviconInvalidFormat || 'Favicon must be SVG, PNG, or ICO' }, { status: 400 })
  }

  let bodyToStore: Buffer = buffer
  let storeContentType = contentType.split(';')[0].trim()

  if (kind === 'svg') {
    const sanitized = sanitizeSvg(buffer.toString('utf-8'))
    if (!sanitized) {
      return NextResponse.json({ error: settingsMessages.faviconUnsafeSvg || 'Invalid or unsafe SVG content' }, { status: 400 })
    }
    bodyToStore = Buffer.from(sanitized, 'utf-8')
    storeContentType = 'image/svg+xml'
  } else if (kind === 'png') {
    storeContentType = 'image/png'
  } else if (kind === 'ico') {
    storeContentType = 'image/x-icon'
  }

  const targetPath = FAVICON_PATHS[kind]

  try {
    await initStorage()

    // Remove any previously uploaded favicon (different format) so we don't
    // leave orphaned files of other extensions.
    await removeAllFaviconFiles()

    await uploadFile(targetPath, bodyToStore, bodyToStore.byteLength, storeContentType)

    try {
      await prisma.settings.upsert({
        where: { id: 'default' },
        update: { brandingFaviconPath: '/api/branding/favicon' },
        create: { id: 'default', brandingFaviconPath: '/api/branding/favicon' },
      })
    } catch (dbError) {
      // DB write failed — clean up the orphaned file we just stored.
      await deleteFile(targetPath).catch((cleanupError) => {
        logError('[SETTINGS:FAVICON] Failed to roll back orphaned favicon file', cleanupError)
      })
      throw dbError
    }

    return NextResponse.json({
      path: '/api/branding/favicon',
      format: kind,
    })
  } catch (error) {
    logError('[SETTINGS:FAVICON] Upload failed', error)
    return NextResponse.json({ error: settingsMessages.faviconUploadFailed || 'Failed to upload favicon' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const settingsMessages = messages?.settings || {}

  const auth = await requireApiAdmin(request)
  if (auth instanceof Response) return auth

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: settingsMessages.tooManyRequestsSlowDown || 'Too many requests. Please slow down.',
  }, 'settings-favicon-delete', auth.id)
  if (rateLimitResult) return rateLimitResult

  try {
    await initStorage()
    await removeAllFaviconFiles()
    await prisma.settings.update({
      where: { id: 'default' },
      data: { brandingFaviconPath: null },
    })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    logError('[SETTINGS:FAVICON] Delete failed', error)
    return NextResponse.json({ error: settingsMessages.faviconRemoveFailed || 'Failed to remove favicon' }, { status: 500 })
  }
}
