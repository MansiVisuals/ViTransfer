import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiAdmin } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { deleteFile } from '@/lib/storage'
import { validateRequest, updatePhotoSchema } from '@/lib/validation'
import { getAutoApproveProject } from '@/lib/settings'
import { handleApprovalNotification } from '@/lib/notifications'
import { logError, logMessage } from '@/lib/logging'

export const runtime = 'nodejs'

// GET /api/photos/[id] - Get photo status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 120,
    message: 'Too many requests. Please slow down.',
  }, 'photo-status')
  if (rateLimitResult) return rateLimitResult

  try {
    const { id } = await params

    const photo = await prisma.photo.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        width: true,
        height: true,
        mimeType: true,
        originalFileName: true,
        originalFileSize: true,
        sortOrder: true,
        approved: true,
        approvedAt: true,
      }
    })

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    return NextResponse.json({
      ...photo,
      originalFileSize: photo.originalFileSize.toString(),
    })
  } catch (error) {
    logError('Error fetching photo status:', error)
    return NextResponse.json({ error: 'Failed to fetch photo status' }, { status: 500 })
  }
}

// Helper: Check if all photos are approved
async function checkAllPhotosApproved(projectId: string): Promise<boolean> {
  const photos = await prisma.photo.findMany({
    where: { projectId, status: 'READY' },
    select: { approved: true }
  })
  if (photos.length === 0) return false
  return photos.every(p => p.approved)
}

// PATCH /api/photos/[id] - Update photo (status, metadata, approval)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many photo update requests. Please slow down.',
  }, 'photo-update')
  if (rateLimitResult) return rateLimitResult

  try {
    const { id } = await params
    const body = await request.json()

    // Handle approval separately (not in updatePhotoSchema)
    const { approved, ...rest } = body

    // Validate non-approval fields if present
    if (Object.keys(rest).length > 0) {
      const validation = validateRequest(updatePhotoSchema, rest)
      if (!validation.success) {
        return NextResponse.json(
          { error: validation.error, details: validation.details },
          { status: 400 }
        )
      }
    }

    const photo = await prisma.photo.findUnique({
      where: { id },
      include: { project: true }
    })

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    // Build update data
    const updateData: any = {}

    if (rest.status !== undefined) updateData.status = rest.status
    if (rest.name !== undefined) updateData.name = rest.name
    if (rest.width !== undefined) updateData.width = rest.width
    if (rest.height !== undefined) updateData.height = rest.height
    if (rest.sortOrder !== undefined) updateData.sortOrder = rest.sortOrder

    if (approved !== undefined) {
      if (typeof approved !== 'boolean') {
        return NextResponse.json({ error: 'approved must be a boolean' }, { status: 400 })
      }
      updateData.approved = approved
      updateData.approvedAt = approved ? new Date() : null
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    await prisma.photo.update({
      where: { id },
      data: updateData
    })

    // Update project status if approval changed
    if (approved !== undefined) {
      logMessage(`[PHOTO-APPROVAL] Admin toggled approval for photo ${id} to ${approved}`)
      const allApproved = await checkAllPhotosApproved(photo.projectId)
      const autoApprove = await getAutoApproveProject()

      if (allApproved && approved && autoApprove) {
        await prisma.project.update({
          where: { id: photo.projectId },
          data: { status: 'APPROVED', approvedAt: new Date() }
        })
      } else if (!approved && photo.project.status === 'APPROVED') {
        await prisma.project.update({
          where: { id: photo.projectId },
          data: { status: 'IN_REVIEW', approvedAt: null, approvedVideoId: null }
        })
      }

      // Send approval notification
      try {
        await handleApprovalNotification({
          project: {
            id: photo.project.id,
            title: photo.project.title,
            slug: photo.project.slug,
            clientNotificationSchedule: photo.project.clientNotificationSchedule,
          },
          approvedVideos: [{ id: photo.id, name: photo.name }],
          approved,
          isComplete: allApproved && approved,
        })
      } catch (notifError) {
        logError('[PHOTO-APPROVAL] Notification error:', notifError)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logError('Error updating photo:', error)
    return NextResponse.json({ error: 'Failed to update photo' }, { status: 500 })
  }
}

// DELETE /api/photos/[id] - Delete photo + storage file
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many photo delete requests. Please slow down.',
  }, 'photo-delete')
  if (rateLimitResult) return rateLimitResult

  try {
    const { id } = await params

    const photo = await prisma.photo.findUnique({
      where: { id },
      select: { id: true, originalStoragePath: true }
    })

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    // Delete file from storage
    try {
      if (photo.originalStoragePath) {
        await deleteFile(photo.originalStoragePath)
      }
    } catch (error) {
      logError(`Failed to delete file for photo ${photo.id}:`, error)
      // Continue with DB deletion even if storage fails
    }

    // Delete from database (cascade handles comments)
    await prisma.photo.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    logError('Error deleting photo:', error)
    return NextResponse.json({ error: 'Failed to delete photo' }, { status: 500 })
  }
}
