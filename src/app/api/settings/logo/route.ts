import { NextRequest, NextResponse } from 'next/server'
import { requireApiAdmin } from '@/lib/auth'
import { initStorage, uploadFile, deleteFile, getFilePath } from '@/lib/storage'
import { prisma } from '@/lib/db'
import fs from 'fs/promises'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_SIZE_BYTES = 300 * 1024
const STORAGE_PATH = 'branding/logo.svg'
const PNG_CACHE_PATH = 'branding/logo.png'
const DEFAULT_CACHE_PREFIX = 'branding/default-logo-'
const VALID_ACCENT_COLORS = ['blue', 'purple', 'green', 'orange', 'red', 'pink', 'teal', 'amber', 'stone', 'gold']

/**
 * Clear all cached logo PNGs (custom and default)
 * Called whenever logo changes to ensure fresh generation
 */
async function clearAllLogoPngCaches(): Promise<void> {
  // Delete custom logo PNG cache
  try {
    await deleteFile(PNG_CACHE_PATH)
  } catch {
    // Ignore if doesn't exist
  }
  
  // Delete all default logo PNG caches (one per accent color)
  for (const color of VALID_ACCENT_COLORS) {
    try {
      await fs.unlink(getFilePath(`${DEFAULT_CACHE_PREFIX}${color}.png`))
    } catch {
      // Ignore if doesn't exist
    }
  }
}

function isSafeSvg(svg: string): boolean {
  // Strip XML declaration if present before checking for <svg
  const stripped = svg.trim().replace(/^<\?xml[^?]*\?>\s*/i, '')
  // Basic hardening: must start with <svg, reject scripts/handlers/js urls
  if (!/^<svg[\s>]/i.test(stripped)) return false
  if (/<script[\s>]/i.test(svg)) return false
  if (/on[a-zA-Z]+\s*=/.test(svg)) return false
  if (/javascript:/i.test(svg)) return false
  return true
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(request)
  if (auth instanceof Response) return auth

  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('image/svg+xml')) {
    return NextResponse.json({ error: 'Only SVG files are allowed' }, { status: 400 })
  }

  const buffer = Buffer.from(await request.arrayBuffer())
  if (buffer.byteLength > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'SVG too large (max 300KB)' }, { status: 400 })
  }

  // Magic check: require "<svg" near the start and the XML signature
  const leading = buffer.slice(0, 256).toString('utf-8').trimStart()
  if (!leading.toLowerCase().startsWith('<svg') && !leading.toLowerCase().startsWith('<?xml')) {
    return NextResponse.json({ error: 'Invalid SVG file' }, { status: 400 })
  }

  const svgText = buffer.toString('utf-8')
  if (!isSafeSvg(svgText)) {
    return NextResponse.json({ error: 'Invalid or unsafe SVG content' }, { status: 400 })
  }

  try {
    await initStorage()
    await uploadFile(STORAGE_PATH, buffer, buffer.byteLength, 'image/svg+xml')

    // Clear all cached PNGs so the new logo is used everywhere
    await clearAllLogoPngCaches()

    try {
      await prisma.settings.upsert({
        where: { id: 'default' },
        update: { brandingLogoPath: '/api/branding/logo' },
        create: {
          id: 'default',
          brandingLogoPath: '/api/branding/logo',
        },
      })
    } catch (dbError) {
      // DB upsert failed — remove orphaned file from disk
      await deleteFile(STORAGE_PATH).catch(() => {})
      throw dbError
    }

    return NextResponse.json({ path: '/api/branding/logo' })
  } catch (error) {
    console.error('[SETTINGS:LOGO] Upload failed:', error)
    return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiAdmin(request)
  if (auth instanceof Response) return auth

  try {
    await initStorage()
    await deleteFile(STORAGE_PATH)
    
    // Clear all cached PNGs so the default logo is used
    await clearAllLogoPngCaches()
    
    await prisma.settings.update({
      where: { id: 'default' },
      data: { brandingLogoPath: null },
    })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[SETTINGS:LOGO] Delete failed:', error)
    return NextResponse.json({ error: 'Failed to delete logo' }, { status: 500 })
  }
}
