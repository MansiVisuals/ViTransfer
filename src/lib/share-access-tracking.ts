import { prisma } from './db'
import { NextRequest } from 'next/server'
import { getSecuritySettings } from './video-access'
import { enqueueExternalNotification } from '@/lib/external-notifications/enqueueExternalNotification'
import { generateShareUrl, getAppUrl } from '@/lib/url'

export async function trackSharePageAccess(params: {
  projectId: string
  accessMethod: 'OTP' | 'PASSWORD' | 'GUEST' | 'NONE'
  email?: string
  sessionId: string
  request: NextRequest
}) {
  const { projectId, accessMethod, email, sessionId, request } = params

  // Analytics tracking is optional and should never block share access.
  const settings = await getSecuritySettings()

  // Get IP address from headers
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown'
  const userAgent = request.headers.get('user-agent') || undefined

  if (settings.trackAnalytics) {
    try {
      await prisma.sharePageAccess.create({
        data: {
          projectId,
          accessMethod,
          email,
          sessionId,
          ipAddress,
          userAgent,
        },
      })
    } catch (error) {
      console.error('[ANALYTICS] Failed to track share page access:', error)
    }
  }

  // Fetch project info once for both body and pushData
  const project = await prisma.project
    .findUnique({
      where: { id: projectId },
      select: { id: true, title: true, slug: true },
    })
    .catch(() => null)

  void enqueueExternalNotification({
    eventType: 'SHARE_ACCESS',
    title: `Share Link Opened: ${project?.title || 'Unknown Project'}`,
    body: await (async () => {
      const shareUrl = project?.slug ? await generateShareUrl(project.slug, request).catch(() => '') : ''
      const baseUrl = await getAppUrl(request).catch(() => '')

      return [
        `${email || 'Someone'} opened ${project?.title || 'a project'}`,
        `Method: ${accessMethod}`,
        shareUrl ? `Link: ${shareUrl}` : baseUrl ? `Link: ${baseUrl}` : null,
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
  }).catch(() => {})
}
