import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendNewVersionEmail, sendProjectGeneralNotificationEmail, sendPasswordEmail } from '@/lib/email'
import { generateShareUrl } from '@/lib/url'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { decrypt } from '@/lib/encryption'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check if user is authenticated
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId } = await params
    const body = await request.json()
    const { videoId, notifyEntireProject, sendPasswordSeparately } = body

    // Get project details including password
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        title: true,
        description: true,
        clientName: true,
        clientEmail: true,
        slug: true,
        sharePassword: true,
        videos: {
          where: { status: 'READY' },
          select: {
            id: true,
            name: true,
            versionLabel: true,
            status: true,
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!project.clientEmail) {
      return NextResponse.json({ error: 'No client email configured for this project' }, { status: 400 })
    }

    // Generate share URL
    const shareUrl = await generateShareUrl(project.slug)
    const isPasswordProtected = !!project.sharePassword

    let result

    if (notifyEntireProject) {
      // Send general project notification with all ready videos
      result = await sendProjectGeneralNotificationEmail({
        clientEmail: project.clientEmail,
        clientName: project.clientName || 'Client',
        projectTitle: project.title,
        projectDescription: project.description || '',
        shareUrl,
        readyVideos: project.videos.map(v => ({ name: v.name, versionLabel: v.versionLabel })),
        isPasswordProtected,
      })
    } else {
      // Specific video notification
      if (!videoId) {
        return NextResponse.json({ error: 'videoId is required for specific video notification' }, { status: 400 })
      }

      // Get video details
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        select: {
          name: true,
          versionLabel: true,
          status: true,
        }
      })

      if (!video) {
        return NextResponse.json({ error: 'Video not found' }, { status: 404 })
      }

      if (video.status !== 'READY') {
        return NextResponse.json(
          { error: 'Video is not ready yet. Please wait for processing to complete.' },
          { status: 400 }
        )
      }

      // Send specific video notification
      result = await sendNewVersionEmail({
        clientEmail: project.clientEmail,
        clientName: project.clientName || 'Client',
        projectTitle: project.title,
        videoName: video.name,
        versionLabel: video.versionLabel,
        shareUrl,
        isPasswordProtected,
      })
    }

    // Send password in separate email if requested and project is password protected
    let passwordEmailResult = { success: true }
    if (sendPasswordSeparately && isPasswordProtected && project.sharePassword) {
      try {
        // Wait 10 seconds before sending password email to ensure it arrives after the main email
        await new Promise(resolve => setTimeout(resolve, 10000))

        // Decrypt the password before sending
        const decryptedPassword = decrypt(project.sharePassword)

        passwordEmailResult = await sendPasswordEmail({
          clientEmail: project.clientEmail,
          clientName: project.clientName || 'Client',
          projectTitle: project.title,
          password: decryptedPassword,
        })
      } catch (error) {
        console.error('Error sending password email:', error)
        console.error('Error details:', error instanceof Error ? error.message : 'Unknown error')
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
        passwordEmailResult = { success: false }
      }
    }

    if (result.success) {
      let passwordMsg = ''
      if (sendPasswordSeparately && isPasswordProtected) {
        if (passwordEmailResult.success) {
          passwordMsg = ' Password sent in separate email.'
        } else {
          passwordMsg = ' Warning: Main email sent but password email failed.'
        }
      }
      return NextResponse.json({
        success: true,
        message: `Notification sent to ${project.clientEmail}.${passwordMsg}`
      })
    } else {
      return NextResponse.json(
        { error: `Failed to send email: ${result.error}` },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Notify error:', error)
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    )
  }
}
