import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isSmtpConfigured, sendProjectApprovedEmail, sendAdminProjectApprovedEmail } from '@/lib/email'
import { handleApprovalNotification } from '@/lib/notifications'
import { getProjectRecipients, getPrimaryRecipient } from '@/lib/recipients'
import { generateShareUrl } from '@/lib/url'
import { getAutoApproveProject } from '@/lib/settings'
import { verifyProjectAccess } from '@/lib/project-access'
import { rateLimit } from '@/lib/rate-limit'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'
import { z } from 'zod'

const approveSchema = z.object({
  authorName: z.string().trim().max(100, 'Name too long').optional().nullable(),
  authorEmail: z.string().email().max(255, 'Email too long').optional().nullable(),
  selectedVideoId: z.string().min(1, 'Selected video is required'),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Rate limiting: 20 approval actions per minute
  const rateLimitResult = await rateLimit(request, {
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: 'Too many approval requests. Please slow down.'
  }, 'project-approve')

  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const { id: projectId } = await params
    const body = await request.json()
    const parsed = approveSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }

    const { authorName, authorEmail, selectedVideoId } = parsed.data

    console.log('[APPROVAL] Starting approval process for project:', projectId)
    console.log('[APPROVAL] Selected video:', selectedVideoId)

    // SECURITY: Validate share password if project is password-protected
    // This allows clients to approve their own projects via the share link
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        videos: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Verify project access using dual auth pattern (clients can approve via share link)
    const accessCheck = await verifyProjectAccess(request, project.id, project.sharePassword, project.authMode)

    // CSRF: enforce token for admins, origin-check for client approvals
    const csrfCheck = accessCheck.isAdmin
      ? await validateCsrfProtection(request)
      : await validateCsrfProtection(request, { requireToken: false })
    if (csrfCheck) return csrfCheck

    if (!accessCheck.authorized) {
      return NextResponse.json({
        error: 'Password required to approve this project'
      }, { status: 401 })
    }

    if (project.status === 'APPROVED') {
      return NextResponse.json({ error: 'Project already approved' }, { status: 400 })
    }

    // Find the selected video
    const selectedVideo = project.videos.find(v => v.id === selectedVideoId)

    if (!selectedVideo) {
      return NextResponse.json({ error: 'Selected video not found' }, { status: 404 })
    }

    // IMPORTANT: When approving a video, unapprove all other versions of the SAME video
    // This ensures only ONE version per video name can be approved at a time
    await prisma.video.updateMany({
      where: {
        projectId,
        name: selectedVideo.name, // Same video name
        id: { not: selectedVideoId }, // But different version
      },
      data: {
        approved: false,
        approvedAt: null,
      },
    })

    // Now approve the selected video
    await prisma.video.update({
      where: { id: selectedVideoId },
      data: {
        approved: true,
        approvedAt: new Date(),
      },
    })

    // Check if all UNIQUE videos have at least one approved version
    const allVideos = await prisma.video.findMany({
      where: { projectId },
      select: { id: true, approved: true, name: true },
    })

    // Group videos by name to get unique videos
    const videosByName = allVideos.reduce((acc: Record<string, any[]>, video) => {
      if (!acc[video.name]) {
        acc[video.name] = []
      }
      acc[video.name].push(video)
      return acc
    }, {})

    // Check if each unique video has at least one approved version
    const allApproved = Object.values(videosByName).every((versions: any[]) =>
      versions.some(v => v.approved)
    )

    // Check if auto-approve is enabled
    const autoApprove = await getAutoApproveProject()

    // If all unique videos are approved AND auto-approve enabled, approve the project
    if (allApproved && autoApprove) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedVideoId: selectedVideoId, // Keep for backward compatibility
        },
      })

      // NOTE: Approval notifications are always sent immediately (see email sending code below)
      // They are NOT queued because approvals should notify clients right away
    }

    console.log('[APPROVAL] Video approval complete, preparing notifications')

    // Handle approval notifications (will queue and/or send immediately based on schedule)
    try {
      const smtpConfigured = await isSmtpConfigured()
      console.log('[APPROVAL] SMTP configured:', smtpConfigured)

      if (!smtpConfigured) {
        console.log('[APPROVAL] SMTP not configured, skipping notifications')
      } else {
        // Get all approved videos for multi-video support
        const approvedVideos = allVideos.filter(v => v.approved)
        const approvedVideosList = approvedVideos.map(v => ({
          name: v.name,
          id: v.id
        }))

        // Determine if this is a complete project approval or partial
        // Complete = ALL unique videos have at least one approved version
        const isCompleteProjectApproval = allApproved && autoApprove

        // Use new unified notification system
        const safeAuthorName = authorName || undefined
        const safeAuthorEmail = authorEmail || undefined

        await handleApprovalNotification({
          project: {
            id: project.id,
            title: project.title,
            slug: project.slug,
            clientNotificationSchedule: project.clientNotificationSchedule
          },
          approvedVideos: approvedVideosList,
          approved: true,
          authorName: safeAuthorName,
          authorEmail: safeAuthorEmail,
          isComplete: isCompleteProjectApproval, // Pass whether ALL videos are approved
        })
      }
    } catch (error) {
      console.error('[APPROVAL] Error handling approval notifications:', error)
    }

    console.log('[APPROVAL] Approval process complete, returning success')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[APPROVAL] ERROR in approval route:', error)
    return NextResponse.json({ error: 'Failed to approve project' }, { status: 500 })
  }
}
