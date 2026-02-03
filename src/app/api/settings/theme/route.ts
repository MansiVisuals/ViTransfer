import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public endpoint to get appearance settings (theme and accent color)
 * No authentication required - this is needed for initial page load
 */
export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { defaultTheme: true, accentColor: true, brandingLogoPath: true },
    })

    return NextResponse.json({
      defaultTheme: settings?.defaultTheme || 'auto',
      accentColor: settings?.accentColor || 'blue',
      brandingLogoPath: settings?.brandingLogoPath || null,
    })
  } catch (error) {
    // Default values on error
    return NextResponse.json({ defaultTheme: 'auto', accentColor: 'blue', brandingLogoPath: null })
  }
}
