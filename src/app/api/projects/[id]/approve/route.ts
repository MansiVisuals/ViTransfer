import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { sendProjectApprovedEmail, sendAdminProjectApprovedEmail } from '@/lib/email'
import { generateShareUrl } from '@/lib/url'
import { getProjectRecipients, getPrimaryRecipient } from '@/lib/recipients'
import { getAutoApproveProject } from '@/lib/settings'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: projectId } = await params
    const body = await request.json()
    const { authorName, authorEmail, selectedVideoId } = body

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

    // SECURITY: Check password authentication for password-protected projects using cookies
    if (project.sharePassword) {
      const cookieStore = await cookies()
      const authSessionId = cookieStore.get('share_auth')?.value

      if (!authSessionId) {
        return NextResponse.json({
          error: 'Password required to approve this project'
        }, { status: 401 })
      }

      // Verify auth session maps to this project
      const redis = await import('@/lib/video-access').then(m => m.getRedis())
      const mappedProjectId = await redis.get(`auth_project:${authSessionId}`)

      if (mappedProjectId !== project.id) {
        return NextResponse.json({
          error: 'Password required to approve this project'
        }, { status: 401 })
      }
    }
    // If no password protection, anyone can approve

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
    }

    // Send email notification to all recipients
    try {
      const recipients = await getProjectRecipients(projectId)
      const shareUrl = await generateShareUrl(project.slug)

      // Get all approved videos for multi-video support
      const approvedVideos = allVideos.filter(v => v.approved)
      const approvedVideosList = approvedVideos.map(v => ({
        name: v.name,
        id: v.id
      }))

      // Only send emails to recipients with email addresses
      const emailPromises = recipients
        .filter(recipient => recipient.email)
        .map(recipient =>
          sendProjectApprovedEmail({
            clientEmail: recipient.email!,
            clientName: recipient.name || 'Client',
            projectTitle: project.title,
            shareUrl,
            approvedVideos: approvedVideosList,
            isComplete: allApproved,
          })
        )

      await Promise.allSettled(emailPromises)
    } catch (emailError) {
      // Don't fail the request if email sending fails
    }

    // Send email notification to admins
    try {
      const primaryRecipient = await getPrimaryRecipient(projectId)
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { email: true }
      })

      if (admins.length > 0) {
        // Get all approved videos for multi-video support
        const approvedVideos = allVideos.filter(v => v.approved)
        const approvedVideosList = approvedVideos.map(v => ({
          name: v.name,
          id: v.id
        }))

        await sendAdminProjectApprovedEmail({
          adminEmails: admins.map((a: { email: string }) => a.email),
          clientName: primaryRecipient?.name || 'Client',
          projectTitle: project.title,
          approvedVideos: approvedVideosList,
          isComplete: allApproved,
        })
      }
    } catch (emailError) {
      // Don't fail the request if email sending fails
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error approving project:', error)
    return NextResponse.json({ error: 'Failed to approve project' }, { status: 500 })
  }
}
