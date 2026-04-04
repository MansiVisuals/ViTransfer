import { prisma } from '@/lib/db'
import { isSmtpConfigured } from '@/lib/settings'
import { sendAdminClientUploadEmail } from '@/lib/email'
import { enqueueExternalNotification } from '@/lib/external-notifications/enqueueExternalNotification'
import { getAppDomain } from '@/lib/url'
import { logError, logMessage } from '@/lib/logging'

/**
 * Send notifications when a client uploads files via reverse share.
 * Triggers:
 *  - External notifications (Apprise + web push) with CLIENT_UPLOAD event
 *  - Admin email notification (always immediate, like approvals)
 */
export async function handleReverseShareUploadNotification(params: {
  projectId: string
  fileName: string
  uploaderName?: string | null
  uploaderEmail?: string | null
}): Promise<void> {
  const { projectId, fileName, uploaderName, uploaderEmail } = params

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, title: true, slug: true },
    })

    if (!project) {
      logMessage('[UPLOAD-NOTIFICATION] Project not found')
      return
    }

    const displayName = uploaderName || 'A client'
    const displayEmail = uploaderEmail || undefined

    // ── External notifications (Apprise + Web Push) ──────────────────────
    const appDomain = await getAppDomain()
    const adminUrl = appDomain
      ? `${appDomain.replace(/\/$/, '')}/login?returnUrl=${encodeURIComponent(`/admin/projects/${project.id}`)}`
      : ''

    void enqueueExternalNotification({
      eventType: 'CLIENT_UPLOAD',
      title: `New Upload: ${project.title}`,
      body: [
        `${displayName}${displayEmail ? ` (${displayEmail})` : ''} uploaded a file`,
        `File: ${fileName}`,
        `Project: ${project.title}`,
        adminUrl ? `Link: ${adminUrl}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      notifyType: 'info',
      pushData: {
        projectTitle: project.title,
        projectId: project.id,
        authorName: displayName,
        email: displayEmail,
        url: adminUrl || undefined,
      },
    }).catch((err) => {
      logError('[UPLOAD-NOTIFICATION] Failed to enqueue external notification', err)
    })

    // ── Admin email notification ─────────────────────────────────────────
    const smtpConfigured = await isSmtpConfigured()
    if (!smtpConfigured) {
      logMessage('[UPLOAD-NOTIFICATION] Email skipped - SMTP not configured')
      return
    }

    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { email: true },
    })

    if (admins.length === 0) {
      logMessage('[UPLOAD-NOTIFICATION] No admins to notify')
      return
    }

    const result = await sendAdminClientUploadEmail({
      adminEmails: admins.map(a => a.email),
      uploaderName: displayName,
      uploaderEmail: displayEmail,
      projectTitle: project.title,
      projectId: project.id,
      fileNames: [fileName],
    })

    if (result.success) {
      logMessage(`[UPLOAD-NOTIFICATION] ${result.message}`)
    } else {
      logError(`[UPLOAD-NOTIFICATION] Failed: ${result.message}`)
    }
  } catch (error) {
    logError('[UPLOAD-NOTIFICATION] Error processing notification:', error)
  }
}
