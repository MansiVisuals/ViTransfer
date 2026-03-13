import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'




export const dynamic = 'force-dynamic'

/**
 * GET /api/settings/default-quality
 * 
 * Public endpoint - Returns default preview resolution setting
 * This is used by public share pages to determine initial video quality
 * 
 * SECURITY NOTE: This is intentionally public as it only exposes
 * a non-sensitive preference setting (720p or 1080p default).
 * No private data is exposed.
 */
export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { 
        defaultPreviewResolution: true 
      },
    })

    return NextResponse.json({
      defaultPreviewResolution: settings?.defaultPreviewResolution || '720p'
    })
  } catch (error) {
    logError('Error fetching default quality:', error)
    return NextResponse.json(
      { defaultPreviewResolution: '720p' },
      { status: 200 } // Still return default even on error
    )
  }
}
