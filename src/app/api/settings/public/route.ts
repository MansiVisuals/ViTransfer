import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Prevent static generation for this route
export const dynamic = 'force-dynamic'

/**
 * Public endpoint to fetch non-sensitive settings
 * This is safe to expose - returns company name and default preview quality
 */
export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: {
        companyName: true,
        defaultPreviewResolution: true,
      },
    })

    return NextResponse.json({
      companyName: settings?.companyName || 'Studio',
      defaultPreviewResolution: settings?.defaultPreviewResolution || '720p',
    })
  } catch (error) {
    console.error('Error fetching public settings:', error)
    // Return defaults on error
    return NextResponse.json({
      companyName: 'Studio',
      defaultPreviewResolution: '720p',
    })
  }
}
