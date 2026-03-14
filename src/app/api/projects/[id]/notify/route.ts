import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendNewVersionEmail, sendProjectGeneralNotificationEmail, sendPasswordEmail, getRecipientLocale } from '@/lib/email'
import { generateShareUrl } from '@/lib/url'
import { requireApiAdmin } from '@/lib/auth'
import { decrypt } from '@/lib/encryption'
import { getProjectRecipients } from '@/lib/recipients'
import { rateLimit } from '@/lib/rate-limit'
import { buildUnsubscribeUrl, generateRecipientUnsubscribeToken } from '@/lib/unsubscribe'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'
import { isSmtpConfigured } from '@/lib/settings'

export const runtime = 'nodejs'



export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const locale = await getConfiguredLocale()
    const messages = await loadLocaleMessages(locale)
    const projectMessages = messages?.projects || {}

    // Require admin
    const authResult = await requireApiAdmin(request)
    if (authResult instanceof Response) {
      return authResult
    }

    // Throttle to prevent email spam
    const rateLimitResult = await rateLimit(request, {
      windowMs: 60 * 1000,
      maxRequests: 20,
      message: projectMessages.tooManyNotificationRequests || 'Too many notification requests. Please slow down.',
    }, 'project-notify')
    if (rateLimitResult) return rateLimitResult

    // Check if SMTP is configured
    const smtpConfigured = await isSmtpConfigured()
    if (!smtpConfigured) {
      return NextResponse.json(
        { error: projectMessages.emailNotificationsUnavailable || 'Email notifications are not available. Please configure SMTP settings in the admin panel.' },
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
  return NextResponse.json({ error: projectMessages.projectNotFound || 'Project not found' }, { status: 404 })
    }

    // Get recipients
    const recipients = await getProjectRecipients(projectId)

    if (recipients.length === 0) {
  return NextResponse.json({ error: projectMessages.noRecipientsConfigured || 'No recipients configured for this project' }, { status: 400 })
    }

    // Generate share URL
    const shareUrl = await generateShareUrl(project.slug)
    const isPasswordProtected = !!project.sharePassword

    // Prepare video data if specific video notification
    let video = null
    if (!notifyEntireProject) {
      if (!videoId) {
  return NextResponse.json({ error: projectMessages.videoIdRequiredForNotification || 'videoId is required for specific video notification' }, { status: 400 })
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
  return NextResponse.json({ error: messages?.share?.videoNotFound || 'Video not found' }, { status: 404 })
      }

      if (video.status !== 'READY') {
        return NextResponse.json(
          { error: projectMessages.videoNotReady || 'Video is not ready yet. Please wait for processing to complete.' },
          { status: 400 }
        )
      }
    }

    // Send emails to all recipients with email addresses
    const emailPromises = recipients
      .filter(recipient => recipient.email)
      .map(async (recipient) => {
        let unsubscribeUrl: string | undefined
        try {
          const token = generateRecipientUnsubscribeToken({
            recipientId: recipient.id!,
            projectId,
            recipientEmail: recipient.email!,
          })
          unsubscribeUrl = buildUnsubscribeUrl(new URL(shareUrl).origin, token)
        } catch {
          unsubscribeUrl = undefined
        }

        if (notifyEntireProject) {
          // Resolve per-recipient locale
          const recipientLocale = await getRecipientLocale(recipient.email!)
          return sendProjectGeneralNotificationEmail({
            clientEmail: recipient.email!,
            clientName: recipient.name || 'Client',
            projectTitle: project.title,
            projectDescription: project.description || '',
            shareUrl,
            readyVideos: project.videos.map(v => ({ name: v.name, versionLabel: v.versionLabel })),
            isPasswordProtected,
            unsubscribeUrl,
            locale: recipientLocale,
          })
        } else {
          // Resolve per-recipient locale
          const recipientLocale = await getRecipientLocale(recipient.email!)
          return sendNewVersionEmail({
            clientEmail: recipient.email!,
            clientName: recipient.name || 'Client',
            projectTitle: project.title,
            videoName: video!.name,
            versionLabel: video!.versionLabel,
            shareUrl,
            isPasswordProtected,
            unsubscribeUrl,
            locale: recipientLocale,
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
            (async () => {
              let unsubscribeUrl: string | undefined
              try {
                const token = generateRecipientUnsubscribeToken({
                  recipientId: recipient.id!,
                  projectId,
                  recipientEmail: recipient.email!,
                })
                unsubscribeUrl = buildUnsubscribeUrl(new URL(shareUrl).origin, token)
              } catch {
                unsubscribeUrl = undefined
              }

              // Resolve per-recipient locale
              const recipientLocale = await getRecipientLocale(recipient.email!)

              return sendPasswordEmail({
              clientEmail: recipient.email!,
              clientName: recipient.name || 'Client',
              projectTitle: project.title,
              password: decryptedPassword,
                unsubscribeUrl,
                locale: recipientLocale,
              })
            })()
          )

        const passwordResults = await Promise.allSettled(passwordPromises)
        passwordSuccessCount = passwordResults.filter(r => r.status === 'fulfilled' && (r.value as any).success).length
        successfulPasswordRecipients = recipientsWithEmails.slice(0, passwordSuccessCount)
      } catch (error) {
        logError('Error sending password emails:', error)
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

      const sentEmailTo = messages?.projects?.sentEmailTo || 'Sent email to {recipients}.'
      const passwordSentTo = messages?.projects?.passwordSentTo || 'Password sent to {recipients}.'

      let message = sentEmailTo.replace('{recipients}', formatRecipientList(successfulRecipients))
      if (sendPasswordSeparately && isPasswordProtected && passwordSuccessCount > 0) {
        message += ` ${passwordSentTo.replace('{recipients}', formatRecipientList(successfulPasswordRecipients))}`
      }
      return NextResponse.json({ success: true, message })
    } else {
      return NextResponse.json(
        { error: projectMessages.failedToSendEmails || 'Failed to send emails to any recipients' },
        { status: 500 }
      )
    }
  } catch (error) {
    logError('Notify error:', error)
    const locale = await getConfiguredLocale().catch(() => 'en')
    const messages = await loadLocaleMessages(locale).catch(() => null)
    const projectMessages = messages?.projects || {}
    return NextResponse.json(
      { error: projectMessages.failedToSendNotification || 'Failed to send notification' },
      { status: 500 }
    )
  }
}
