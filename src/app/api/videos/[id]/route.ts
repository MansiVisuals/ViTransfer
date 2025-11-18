import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { deleteFile } from '@/lib/storage'
import { requireApiAdmin } from '@/lib/auth'
import { getAutoApproveProject } from '@/lib/settings'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'

// Helper: Check if all videos have at least one approved version
async function checkAllVideosApproved(projectId: string): Promise<boolean> {
  const allVideos = await prisma.video.findMany({
    where: { projectId },
    select: { approved: true, name: true }
  })

  // Group by video name
  const videosByName = allVideos.reduce((acc: Record<string, any[]>, video) => {
    if (!acc[video.name]) acc[video.name] = []
    acc[video.name].push(video)
    return acc
  }, {})

  // Check if each unique video has at least one approved version
  return Object.values(videosByName).every((versions: any[]) =>
    versions.some(v => v.approved)
  )
}

// Helper: Update project status based on approval changes
async function updateProjectStatus(
  projectId: string,
  videoId: string,
  approved: boolean,
  currentStatus: string
): Promise<void> {
  const allApproved = await checkAllVideosApproved(projectId)

  // Check if auto-approve is enabled
  const autoApprove = await getAutoApproveProject()

  if (allApproved && approved && autoApprove) {
    // All videos approved AND auto-approve enabled → mark project as approved
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedVideoId: videoId
      }
    })
  } else if (!approved && currentStatus === 'APPROVED') {
    // Unapproving when project was approved → revert to IN_REVIEW
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'IN_REVIEW',
        approvedAt: null,
        approvedVideoId: null
      }
    })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SECURITY: Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // CSRF protection
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

  try {
    const { id } = await params
    const body = await request.json()
    const { approved, name, versionLabel } = body

    // Validate inputs
    if (approved !== undefined && typeof approved !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request: approved must be a boolean' },
        { status: 400 }
      )
    }

    if (name !== undefined && (!name || typeof name !== 'string' || name.trim().length === 0)) {
      return NextResponse.json(
        { error: 'Invalid request: name must be a non-empty string' },
        { status: 400 }
      )
    }

    if (versionLabel !== undefined && (!versionLabel || typeof versionLabel !== 'string' || versionLabel.trim().length === 0)) {
      return NextResponse.json(
        { error: 'Invalid request: versionLabel must be a non-empty string' },
        { status: 400 }
      )
    }

    // At least one field must be provided
    if (approved === undefined && name === undefined && versionLabel === undefined) {
      return NextResponse.json(
        { error: 'Invalid request: at least one field must be provided' },
        { status: 400 }
      )
    }

    // Get video details
    const video = await prisma.video.findUnique({
      where: { id },
      include: { project: true }
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // If approving this video, unapprove all other versions of the SAME video
    if (approved) {
      await prisma.video.updateMany({
        where: {
          projectId: video.projectId,
          name: video.name, // Same video name
          id: { not: id }, // But different version
        },
        data: {
          approved: false,
          approvedAt: null,
        },
      })
    }

    // Build update data object
    const updateData: any = {}

    if (approved !== undefined) {
      updateData.approved = approved
      updateData.approvedAt = approved ? new Date() : null
    }

    if (name !== undefined) {
      updateData.name = name.trim()
    }

    if (versionLabel !== undefined) {
      updateData.versionLabel = versionLabel.trim()
    }

    // Update video
    await prisma.video.update({
      where: { id },
      data: updateData
    })

    // Update project status if approval changed
    if (approved !== undefined) {
      console.log(`[VIDEO-APPROVAL] Admin toggled approval for video ${id} to ${approved}`)
      await updateProjectStatus(video.projectId, id, approved, video.project.status)

      // NOTE: Admin-toggled approvals/unapprovals do NOT send email notifications
      // Only client-initiated approvals (via /approve route) send emails immediately
      // This prevents spam when admins are managing multiple videos
      console.log('[VIDEO-APPROVAL] Admin approval - emails NOT sent (by design)')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update video approval' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // SECURITY: Require admin authentication
  const authResult = await requireApiAdmin(request)
  if (authResult instanceof Response) {
    return authResult
  }

  // CSRF protection
  const csrfCheck = await validateCsrfProtection(request)
  if (csrfCheck) return csrfCheck

  try {
    const { id } = await params
    // Get video details
    const video = await prisma.video.findUnique({
      where: { id },
    })

    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    const projectId = video.projectId

    // Delete all associated files from storage
    try {
      // Delete original file
      if (video.originalStoragePath) {
        await deleteFile(video.originalStoragePath)
      }

      // Delete preview files
      if (video.preview1080Path) {
        await deleteFile(video.preview1080Path)
      }
      if (video.preview720Path) {
        await deleteFile(video.preview720Path)
      }

      // Delete thumbnail
      if (video.thumbnailPath) {
        await deleteFile(video.thumbnailPath)
      }
    } catch (error) {
      console.error(`Failed to delete files for video ${video.id}:`, error)
      // Continue with database deletion even if storage deletion fails
    }

    // Delete video from database (cascade will handle comments)
    await prisma.video.delete({
      where: { id: id },
    })

    return NextResponse.json({
      success: true,
      message: 'Video and all related files deleted successfully',
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete video' },
      { status: 500 }
    )
  }
}
