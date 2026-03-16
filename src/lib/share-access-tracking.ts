import { prisma } from './db'
import { NextRequest } from 'next/server'
import { getSecuritySettings } from './video-access'
import { enqueueExternalNotification } from '@/lib/external-notifications/enqueueExternalNotification'
import { generateShareUrl, getAppUrl } from '@/lib/url'
import { getClientIpAddress } from '@/lib/utils'
import { anonymizeIp } from '@/lib/ip-anonymization'
import { getConfiguredLocale, loadLocaleMessages } from '@/i18n/locale'
import { logError } from '@/lib/logging'

/**
 * Read the GDPR analytics consent from the X-Analytics-Consent header.
 * Returns true (accepted), false (declined), or null (not yet decided).
 */
export function readAnalyticsConsent(request: NextRequest): boolean | null {
  const header = request.headers.get('x-analytics-consent')
  if (header === 'true') return true
  if (header === 'false') return false
  return null
}

export async function trackSharePageAccess(params: {
  projectId: string
  accessMethod: 'OTP' | 'PASSWORD' | 'GUEST' | 'NONE'
  email?: string
  sessionId: string
  request: NextRequest
  analyticsConsent?: boolean | null
}) {
  const { projectId, accessMethod, email, sessionId, request, analyticsConsent } = params

  // Analytics tracking is optional and should never block share access.
  const settings = await getSecuritySettings()

  const rawIp = getClientIpAddress(request)
  const rawUserAgent = request.headers.get('user-agent') || undefined

  // GDPR: Only store PII when explicit consent has been given.
  // If consent is not yet given (null) or declined (false), anonymize.
  const hasConsent = analyticsConsent === true
  const ipAddress = hasConsent ? rawIp : anonymizeIp(rawIp)
  const userAgent = hasConsent ? rawUserAgent : undefined
  const storedEmail = hasConsent ? email : undefined

  if (settings.trackAnalytics) {
    try {
      await prisma.sharePageAccess.create({
        data: {
          projectId,
          accessMethod,
          email: storedEmail,
          sessionId,
          ipAddress,
          userAgent,
        },
      })
    } catch (error) {
      logError('[ANALYTICS] Failed to track share page access', error)
    }
  }

  // Fetch project info once for both body and pushData
  const project = await prisma.project
    .findUnique({
      where: { id: projectId },
      select: { id: true, title: true, slug: true },
    })
    .catch(() => null)

  const locale = await getConfiguredLocale().catch(() => 'en')
  const messages = await loadLocaleMessages(locale).catch(() => null)
  const notificationsText = messages?.notificationsText

  void enqueueExternalNotification({
    eventType: 'SHARE_ACCESS',
    title: (notificationsText?.shareLinkOpenedTitle || 'Share Link Opened: {projectTitle}')
      .replace('{projectTitle}', project?.title || notificationsText?.unknownProject || 'Unknown Project'),
    body: await (async () => {
      const shareUrl = project?.slug ? await generateShareUrl(project.slug, request).catch(() => '') : ''
      const baseUrl = await getAppUrl(request).catch(() => '')
      const person = email || notificationsText?.someone || 'Someone'
      const projectTitle = project?.title || notificationsText?.unknownProject || 'Unknown Project'

      return [
        project?.title
          ? (notificationsText?.openedProject || '{person} opened {projectTitle}')
              .replace('{person}', person)
              .replace('{projectTitle}', projectTitle)
          : (notificationsText?.openedAProject || '{person} opened a project')
              .replace('{person}', person),
        (notificationsText?.method || 'Method: {method}').replace('{method}', accessMethod),
        shareUrl
          ? (notificationsText?.link || 'Link: {url}').replace('{url}', shareUrl)
          : baseUrl
            ? (notificationsText?.link || 'Link: {url}').replace('{url}', baseUrl)
            : null,
      ]
        .filter(Boolean)
        .join('\n')
    })(),
    notifyType: 'info',
    pushData: {
      projectTitle: project?.title || undefined,
      projectId: project?.id || undefined,
      email: email || undefined,
    },
  }).catch((notificationError) => {
    logError('[ANALYTICS] Failed to enqueue share access notification', notificationError)
  })
}
