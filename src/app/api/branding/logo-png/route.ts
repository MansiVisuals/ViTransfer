import { NextResponse } from 'next/server'
import { getFilePath } from '@/lib/storage'
import { prisma } from '@/lib/db'
import fs from 'fs/promises'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STORAGE_PATH = 'branding/logo.svg'
const CACHE_PATH = 'branding/logo.png'
const DEFAULT_CACHE_PREFIX = 'branding/default-logo-'

// Accent color hex values (must match email.ts)
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

/**
 * Generate default logo SVG with accent color
 * Simplified version for email (no CSS variables, light mode only)
 */
function buildDefaultLogoSvg(accentHex: string, size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#000000"/>
  <rect x="7" y="16" width="38" height="32" rx="9" fill="${accentHex}"/>
  <rect x="39" y="24" width="12" height="16" rx="5" fill="#000000"/>
  <path d="M57 24C55.5 22.2 52.5 22.2 51 24L46.5 30C44.5 31.8 44.5 32.2 46.5 34L51 40C52.5 41.8 55.5 41.8 57 40C54.5 34 54.5 30 57 24Z" fill="#ffffff"/>
</svg>`
}

/**
 * Serve logo as PNG for email clients
 * Uses custom uploaded logo if available, otherwise generates default logo with accent color
 */
export async function GET() {
  try {
    // Check if custom logo exists
    const customLogoPath = getFilePath(STORAGE_PATH)
    let hasCustomLogo = false
    try {
      await fs.access(customLogoPath)
      hasCustomLogo = true
    } catch {
      // File doesn't exist
    }
    
    if (hasCustomLogo) {
      // Check for cached custom logo PNG
      const pngPath = getFilePath(CACHE_PATH)
      try {
        const cachedPng = await fs.readFile(pngPath)
        return new NextResponse(new Uint8Array(cachedPng), {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600, must-revalidate',
          },
        })
      } catch {
        // No cached PNG, need to generate
      }

      // Read and convert custom SVG to PNG
      const svgData = await fs.readFile(customLogoPath)
      const pngBuffer = await sharp(svgData)
        .resize({ height: 88, withoutEnlargement: false })
        .png()
        .toBuffer()

      // Cache the PNG
      try {
        await fs.writeFile(pngPath, pngBuffer)
      } catch {
        // Ignore cache write errors
      }

      return new NextResponse(new Uint8Array(pngBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600, must-revalidate',
        },
      })
    }

    // No custom logo - generate default logo with accent color
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { accentColor: true },
    })
    const accentKey = settings?.accentColor || 'blue'
    const accentHex = ACCENT_COLOR_HEX[accentKey] || ACCENT_COLOR_HEX.blue
    
    // Check for cached default logo PNG for this accent color
    const defaultCachePath = getFilePath(`${DEFAULT_CACHE_PREFIX}${accentKey}.png`)
    try {
      const cachedPng = await fs.readFile(defaultCachePath)
      return new NextResponse(new Uint8Array(cachedPng), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600, must-revalidate',
        },
      })
    } catch {
      // No cached PNG, need to generate
    }

    // Generate default logo SVG and convert to PNG
    const svgString = buildDefaultLogoSvg(accentHex, 88)
    const pngBuffer = await sharp(Buffer.from(svgString))
      .png()
      .toBuffer()

    // Cache the default logo PNG
    try {
      await fs.writeFile(defaultCachePath, pngBuffer)
    } catch {
      // Ignore cache write errors
    }

    return new NextResponse(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[BRANDING:LOGO-PNG] Error:', error)
    return NextResponse.json({ error: 'Failed to generate logo' }, { status: 500 })
  }
}
