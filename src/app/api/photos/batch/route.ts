import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { validateRequest, batchUpdatePhotoSortSchema } from '@/lib/validation'
import { logError } from '@/lib/logging'

export const runtime = 'nodejs'

// PATCH /api/photos/batch - Batch update photo sort order
export async function PATCH(request: NextRequest) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many batch operations. Please slow down.'
  }, 'photo-batch-ops')
  if (rateLimitResult) return rateLimitResult

  try {
    const body = await request.json()

    const validation = validateRequest(batchUpdatePhotoSortSchema, body)
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error, details: validation.details },
        { status: 400 }
      )
    }

    const { photos } = validation.data

    // Update sort orders in a transaction
    await prisma.$transaction(
      photos.map(({ id, sortOrder }) =>
        prisma.photo.update({
          where: { id },
          data: { sortOrder },
        })
      )
    )

    return NextResponse.json({ success: true, updated: photos.length })
  } catch (error) {
    logError('Error batch updating photos:', error)
    return NextResponse.json({ error: 'Failed to update photos' }, { status: 500 })
  }
}
