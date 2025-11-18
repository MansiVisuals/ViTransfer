import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendNewVersionEmail, sendProjectGeneralNotificationEmail, sendPasswordEmail, isSmtpConfigured } from '@/lib/email'
import { generateShareUrl } from '@/lib/url'
import { getCurrentUserFromRequest } from '@/lib/auth'
import { decrypt } from '@/lib/encryption'
import { getProjectRecipients } from '@/lib/recipients'
import { validateCsrfProtection } from '@/lib/security/csrf-protection'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check if user is authenticated
    const user = await getCurrentUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // CSRF protection
    const csrfCheck = await validateCsrfProtection(request)
    if (csrfCheck) return csrfCheck

    // Check if SMTP is configured
    const smtpConfigured = await isSmtpConfigured()
    if (!smtpConfigured) {
      return NextResponse.json(
        { error: 'Email notifications are not available. Please configure SMTP settings in the admin panel.' },
        { status: 400 }
      )
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

    // Get recipients
    const recipients = await getProjectRecipients(projectId)

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No recipients configured for this project' }, { status: 400 })
    }

    // Generate share URL
    const shareUrl = await generateShareUrl(project.slug)
    const isPasswordProtected = !!project.sharePassword

    // Prepare video data if specific video notification
    let video = null
    if (!notifyEntireProject) {
      if (!videoId) {
        return NextResponse.json({ error: 'videoId is required for specific video notification' }, { status: 400 })
      }

      video = await prisma.video.findUnique({
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
    }

    // Send emails to all recipients with email addresses
    const emailPromises = recipients
      .filter(recipient => recipient.email)
      .map(async (recipient) => {
        if (notifyEntireProject) {
          return sendProjectGeneralNotificationEmail({
            clientEmail: recipient.email!,
            clientName: recipient.name || 'Client',
            projectTitle: project.title,
            projectDescription: project.description || '',
            shareUrl,
            readyVideos: project.videos.map(v => ({ name: v.name, versionLabel: v.versionLabel })),
            isPasswordProtected,
          })
        } else {
          return sendNewVersionEmail({
            clientEmail: recipient.email!,
            clientName: recipient.name || 'Client',
            projectTitle: project.title,
            videoName: video!.name,
            versionLabel: video!.versionLabel,
            shareUrl,
            isPasswordProtected,
          })
        }
      })

    const results = await Promise.allSettled(emailPromises)
    const successCount = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length

    // Get recipients with emails who were actually sent
    const recipientsWithEmails = recipients.filter(r => r.email)
    const successfulRecipients = recipientsWithEmails.slice(0, successCount)

    // Send password emails if requested
    let passwordSuccessCount = 0
    let successfulPasswordRecipients: any[] = []
    if (sendPasswordSeparately && isPasswordProtected && project.sharePassword) {
      try {
        // Wait 10 seconds before sending password emails
        await new Promise(resolve => setTimeout(resolve, 10000))

        const decryptedPassword = decrypt(project.sharePassword)

        const passwordPromises = recipients
          .filter(recipient => recipient.email)
          .map(recipient =>
            sendPasswordEmail({
              clientEmail: recipient.email!,
              clientName: recipient.name || 'Client',
              projectTitle: project.title,
              password: decryptedPassword,
            })
          )

        const passwordResults = await Promise.allSettled(passwordPromises)
        passwordSuccessCount = passwordResults.filter(r => r.status === 'fulfilled' && (r.value as any).success).length
        successfulPasswordRecipients = recipientsWithEmails.slice(0, passwordSuccessCount)
      } catch (error) {
        console.error('Error sending password emails:', error)
      }
    }

    if (successCount > 0) {
      // Format recipient names
      const formatRecipientList = (recipients: any[]) => {
        const names = recipients.map(r => r.name || r.email)
        if (names.length === 1) return names[0]
        if (names.length === 2) return `${names[0]} & ${names[1]}`
        return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1]
      }

      let message = `Sent email to ${formatRecipientList(successfulRecipients)}.`
      if (sendPasswordSeparately && isPasswordProtected && passwordSuccessCount > 0) {
        message += ` Password sent to ${formatRecipientList(successfulPasswordRecipients)}.`
      }
      return NextResponse.json({ success: true, message })
    } else {
      return NextResponse.json(
        { error: 'Failed to send emails to any recipients' },
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
