/**
 * Ultra-Compact Email Templates for Notification System
 * Clean, minimal, and easy to scan
 */

import { escapeHtml, renderEmailButton, renderEmailShell, renderUnsubscribeSection, getEmailBrand, buildTimecodeDeepLink, buildAdminTimecodeDeepLink, renderTimecodePill } from './email'
import { getEmailTemplate, replacePlaceholders } from './email-template-system'
import { processTemplateContent } from './email'
import { loadEmailMessages } from './email-template-system'

interface NotificationData {
  type: 'CLIENT_COMMENT' | 'ADMIN_REPLY' | 'VIDEO_APPROVED' | 'VIDEO_UNAPPROVED' | 'PROJECT_APPROVED'
  videoName: string
  videoLabel?: string
  authorName: string
  authorEmail?: string
  content?: string
  timecode?: string | null
  fps?: number | null
  commentId?: string
  isReply?: boolean
  approved?: boolean
  approvedVideos?: Array<{ id: string; name: string }>
  parentComment?: {
    authorName: string
    content: string
  }
  attachmentNames?: string[]
  createdAt: string
}

interface NotificationSummaryData {
  companyName?: string
  accentColor?: string
  projectTitle: string
  shareUrl: string
  recipientName: string
  recipientEmail: string
  period: string
  notifications: NotificationData[]
  unsubscribeUrl?: string
  locale?: string
}

interface AdminSummaryData {
  companyName?: string
  accentColor?: string
  appDomain?: string
  adminName: string
  period: string
  projects: Array<{
    projectId: string
    projectTitle: string
    shareUrl: string
    notifications: NotificationData[]
  }>
  locale?: string
}

/**
 * Client notification summary
 */
export async function generateNotificationSummaryEmail(data: NotificationSummaryData): Promise<{ subject: string; html: string }> {
  const companyName = data.companyName || 'ViTransfer'
  const brand = getEmailBrand(data.accentColor)
  const emailMessages: Record<string, any> = await loadEmailMessages(data.locale || 'en').catch(() => ({}))
  const summaryMessages = emailMessages.clientActivitySummary || {}
  const greeting = data.recipientName !== data.recipientEmail
    ? data.recipientName
    : 'there'

  // Count notification types
  const commentCount = data.notifications.filter(n => n.type === 'CLIENT_COMMENT' || n.type === 'ADMIN_REPLY').length
  const approvedCount = data.notifications.filter(n => n.type === 'VIDEO_APPROVED' || n.type === 'PROJECT_APPROVED').length
  const unapprovedCount = data.notifications.filter(n => n.type === 'VIDEO_UNAPPROVED').length

  const summaryParts = []
  if (commentCount > 0) {
    summaryParts.push(
      `${commentCount} ${commentCount === 1
        ? (summaryMessages.newCommentSingular || 'new comment')
        : (summaryMessages.newCommentPlural || 'new comments')}`
    )
  }
  if (approvedCount > 0) {
    summaryParts.push(
      `${approvedCount} ${approvedCount === 1
        ? (summaryMessages.approvalSingular || 'approval')
        : (summaryMessages.approvalPlural || 'approvals')}`
    )
  }
  if (unapprovedCount > 0) summaryParts.push(`${unapprovedCount} ${summaryMessages.unapprovedLabel || 'unapproved'}`)
  const summaryText = summaryParts.join(', ') || (summaryMessages.latestActivity || 'Latest activity')

  const itemsHtmlContent = data.notifications.map((n) => {
    if (n.type === 'PROJECT_APPROVED') {
      return `
        <div style="padding:10px 0;">
          <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${brand.muted}; margin-bottom:6px; font-weight:700;">Project approved</div>
          <div style="font-size:14px; color:${brand.text};">All deliverables are ready for download.</div>
        </div>
      `
    }

    if (n.type === 'VIDEO_APPROVED' || n.type === 'VIDEO_UNAPPROVED') {
      const approved = n.type === 'VIDEO_APPROVED'
      return `
        <div style="padding:10px 0;">
          <div style="font-size:14px; font-weight:700; color:${brand.text}; margin-bottom:4px;">${escapeHtml(n.videoName)}${n.videoLabel ? ` ${escapeHtml(n.videoLabel)}` : ''}</div>
          <div style="font-size:13px; color:${approved ? brand.accent : brand.muted}; font-weight:600;">${approved ? 'Approved' : 'Approval removed'}</div>
        </div>
      `
    }

    const isReply = n.isReply && n.parentComment
    const tcLink = buildTimecodeDeepLink(data.shareUrl, { videoName: n.videoName, commentId: n.commentId, timecode: n.timecode, fps: n.fps })
    const tcPill = renderTimecodePill(n.timecode, tcLink, brand)
    return `
      <div style="padding:10px 0;">
        <div style="font-size:13px; color:${brand.muted}; margin-bottom:6px;">
          ${escapeHtml(n.videoName)}${n.videoLabel ? ` ${escapeHtml(n.videoLabel)}` : ''}
        </div>
        <div style="font-size:14px; font-weight:700; color:${brand.text}; margin-bottom:4px;">${escapeHtml(n.authorName)}${tcPill ? ` &nbsp;${tcPill}` : ''}</div>
        ${isReply ? `<div style="font-size:12px; color:${brand.muted}; margin-bottom:8px;">Replying to ${escapeHtml(n.parentComment!.authorName)} — "${escapeHtml(n.parentComment!.content.substring(0, 60))}${n.parentComment!.content.length > 60 ? '...' : ''}"</div>` : ''}
        <div style="font-size:14px; color:${brand.textSubtle}; line-height:1.6; white-space:pre-wrap;">${escapeHtml(n.content || '')}</div>
        ${n.attachmentNames && n.attachmentNames.length > 0 ? `<div style="margin-top:8px; font-size:12px; color:${brand.muted};"><span style="font-weight:700; text-transform:uppercase; letter-spacing:0.08em;">Attachments:</span> ${n.attachmentNames.map(name => escapeHtml(name)).join(', ')}</div>` : ''}
      </div>
    `
  }).join(`<div style="height:1px; background:${brand.border}; margin:6px 0;"></div>`)

  const itemsHtml = `
    <div style="border:1px solid ${brand.border}; border-radius:10px; padding:16px; margin-bottom:14px; background:${brand.surfaceAlt};">
      ${itemsHtmlContent}
    </div>
  `

  const unsubscribeSection = data.unsubscribeUrl ? renderUnsubscribeSection(data.unsubscribeUrl, brand) : ''

  const template = await getEmailTemplate('CLIENT_ACTIVITY_SUMMARY')
  const placeholderValues: Record<string, string> = {
    '{{RECIPIENT_NAME}}': greeting,
    '{{PROJECT_TITLE}}': data.projectTitle,
    '{{SUMMARY_TEXT}}': summaryText,
    '{{PERIOD}}': data.period,
    '{{SUMMARY_ITEMS}}': itemsHtml,
    '{{SHARE_URL}}': data.shareUrl,
    '{{UNSUBSCRIBE_SECTION}}': unsubscribeSection,
    '{{COMPANY_NAME}}': companyName,
  }

  const subject = replacePlaceholders(template.subject, placeholderValues)
  const bodyContent = processTemplateContent(template.bodyContent, placeholderValues, brand)

  const html = renderEmailShell({
    companyName,
    title: summaryMessages.title || 'Project Update',
    subtitle: `${summaryText} ${data.period}`,
    preheader: `Updates on ${data.projectTitle}`,
    footerNote: companyName,
    brand,
    bodyContent,
  }).trim()

  return { subject, html }
}

/**
 * Admin summary - multi-project
 */
export async function generateAdminSummaryEmail(data: AdminSummaryData): Promise<{ subject: string; html: string }> {
  const companyName = data.companyName || 'ViTransfer'
  const brand = getEmailBrand(data.accentColor)
  const emailMessages: Record<string, any> = await loadEmailMessages(data.locale || 'en').catch(() => ({}))
  const summaryMessages = emailMessages.adminActivitySummary || {}
  const greeting = data.adminName ? data.adminName : 'there'
  const totalComments = data.projects.reduce((sum, p) => sum + p.notifications.length, 0)
  const projectCount = data.projects.length
  const commentsWord = totalComments === 1
    ? (summaryMessages.commentSingular || 'comment')
    : (summaryMessages.commentPlural || 'comments')
  const projectsWord = projectCount === 1
    ? (summaryMessages.projectSingular || 'project')
    : (summaryMessages.projectPlural || 'projects')

  const projectsHtml = data.projects.map((project) => {
    const items = project.notifications.map((n, index) => {
      const tcLink = data.appDomain && project.projectId
        ? buildAdminTimecodeDeepLink(data.appDomain, project.projectId, { videoName: n.videoName, commentId: n.commentId, timecode: n.timecode, fps: n.fps })
        : buildTimecodeDeepLink(project.shareUrl, { videoName: n.videoName, commentId: n.commentId, timecode: n.timecode, fps: n.fps })
      const tcPill = renderTimecodePill(n.timecode, tcLink, brand)
      return `
      <div style="padding:10px 0;${index > 0 ? ` border-top:1px solid ${brand.border}; margin-top:8px;` : ''}">
        <div style="font-size:13px; color:${brand.muted}; margin-bottom:6px;">
          ${escapeHtml(n.videoName)}${n.videoLabel ? ` ${escapeHtml(n.videoLabel)}` : ''}
        </div>
        <div style="margin-bottom:4px;">
          <span style="font-size:14px; font-weight:700; color:${brand.text};">${escapeHtml(n.authorName)}</span>
          ${n.authorEmail ? `<span style="font-size:12px; color:${brand.muted}; margin-left:6px;">${escapeHtml(n.authorEmail)}</span>` : ''}
          ${tcPill ? ` &nbsp;${tcPill}` : ''}
        </div>
        <div style="font-size:14px; color:${brand.textSubtle}; line-height:1.6; white-space:pre-wrap;">${escapeHtml(n.content || '')}</div>
        ${n.attachmentNames && n.attachmentNames.length > 0 ? `<div style="margin-top:8px; font-size:12px; color:${brand.muted};"><span style="font-weight:700; text-transform:uppercase; letter-spacing:0.08em;">Attachments:</span> ${n.attachmentNames.map(name => escapeHtml(name)).join(', ')}</div>` : ''}
      </div>
    `}).join('')

    return `
      <div style="border:1px solid ${brand.border}; border-radius:10px; padding:16px; margin-bottom:16px; background:${brand.surfaceAlt};">
        <div style="font-size:15px; font-weight:700; color:${brand.text}; margin-bottom:10px;">${escapeHtml(project.projectTitle)}</div>
        ${items}
        <div style="margin-top: 14px; text-align: center;">
          ${renderEmailButton({ href: project.shareUrl, label: 'View Project', variant: 'secondary', brand })}
        </div>
      </div>
    `
  }).join('')

  const adminUrl = data.projects[0]?.shareUrl ? escapeHtml(data.projects[0].shareUrl.replace(/\/share\/[^/]+/, '/admin/projects')) : '#'

  const template = await getEmailTemplate('ADMIN_ACTIVITY_SUMMARY')
  const placeholderValues: Record<string, string> = {
    '{{RECIPIENT_NAME}}': greeting,
    '{{SUMMARY_TEXT}}': `${totalComments} ${commentsWord} ${summaryMessages.across || 'across'} ${projectCount} ${projectsWord}`,
    '{{PERIOD}}': data.period,
    '{{SUMMARY_PROJECTS}}': projectsHtml,
    '{{ADMIN_URL}}': adminUrl,
    '{{COMPANY_NAME}}': companyName,
  }

  const subject = replacePlaceholders(template.subject, placeholderValues)
  const bodyContent = processTemplateContent(template.bodyContent, placeholderValues, brand)

  const html = renderEmailShell({
    companyName,
    title: summaryMessages.title || 'Client Activity Summary',
    subtitle: `${totalComments} ${commentsWord} ${summaryMessages.across || 'across'} ${projectCount} ${projectsWord} ${data.period}`,
    preheader: `Client activity summary: ${totalComments} updates`,
    footerNote: companyName,
    brand,
    bodyContent,
  }).trim()

  return { subject, html }
}
