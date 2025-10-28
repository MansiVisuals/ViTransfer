import { NextRequest, NextResponse } from 'next/server'
import { runCleanup } from '@/lib/upload-cleanup'

// This route can be called by a cron job to clean up orphaned uploads
// Example: curl -X POST http://localhost:3000/api/cron/cleanup-uploads

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // SECURITY: CRON_SECRET is REQUIRED
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // CRON_SECRET is REQUIRED - fail if not set
  if (!cronSecret) {
    console.error('[CRON] CRON_SECRET not configured - refusing to run cleanup')
    return NextResponse.json({ error: 'Service misconfigured' }, { status: 503 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await runCleanup()

    return NextResponse.json({
      success: true,
      message: 'Cleanup completed successfully'
    })
  } catch (error) {
    console.error('[Cron] Cleanup failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Cleanup failed'
      },
      { status: 500 }
    )
  }
}
