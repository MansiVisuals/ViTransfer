/**
 * Ultra-Compact Email Templates for Notification System
 * Clean, minimal, and easy to scan
 */

import { EMAIL_BRAND, escapeHtml, renderEmailButton, renderEmailShell, renderUnsubscribeSection } from './email'
import { formatTimecodeDisplay } from './timecode'

interface NotificationData {
  type: 'CLIENT_COMMENT' | 'ADMIN_REPLY' | 'VIDEO_APPROVED' | 'VIDEO_UNAPPROVED' | 'PROJECT_APPROVED'
  videoName: string
  videoLabel?: string
  authorName: string
  authorEmail?: string
  content?: string
  timecode?: string | null
  isReply?: boolean
  approved?: boolean
  approvedVideos?: Array<{ id: string; name: string }>
  parentComment?: {
    authorName: string
    content: string
  }
  createdAt: string
}

interface NotificationSummaryData {
  companyName?: string
  projectTitle: string
  shareUrl: string
  recipientName: string
  recipientEmail: string
  period: string
  notifications: NotificationData[]
  unsubscribeUrl?: string
}

interface AdminSummaryData {
  companyName?: string
  adminName: string
  period: string
  projects: Array<{
    projectTitle: string
    shareUrl: string
    notifications: NotificationData[]
  }>
}

function formatTimecodeForEmail(timecode?: string | null): string {
  if (!timecode) return ''
  return formatTimecodeDisplay(timecode)
}

/**
 * Client notification summary
 */
export function generateNotificationSummaryEmail(data: NotificationSummaryData): string {
  const companyName = data.companyName || 'ViTransfer'
  const greeting = data.recipientName !== data.recipientEmail
    ? data.recipientName
    : 'there'

  // Count notification types
  const commentCount = data.notifications.filter(n => n.type === 'CLIENT_COMMENT' || n.type === 'ADMIN_REPLY').length
  const approvedCount = data.notifications.filter(n => n.type === 'VIDEO_APPROVED' || n.type === 'PROJECT_APPROVED').length
  const unapprovedCount = data.notifications.filter(n => n.type === 'VIDEO_UNAPPROVED').length

  const summaryParts = []
  if (commentCount > 0) summaryParts.push(`${commentCount} new ${commentCount === 1 ? 'comment' : 'comments'}`)
  if (approvedCount > 0) summaryParts.push(`${approvedCount} ${approvedCount === 1 ? 'approval' : 'approvals'}`)
  if (unapprovedCount > 0) summaryParts.push(`${unapprovedCount} unapproved`)
  const summaryText = summaryParts.join(', ') || 'Latest activity'

  const itemsHtmlContent = data.notifications.map((n) => {
    if (n.type === 'PROJECT_APPROVED') {
      return `
        <div style="padding:10px 0;">
          <div style="font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:${EMAIL_BRAND.accent}; margin-bottom:6px; font-weight:700;">Project approved</div>
          <div style="font-size:14px; color:${EMAIL_BRAND.text};">All videos are ready for download.</div>
        </div>
      `
    }

    if (n.type === 'VIDEO_APPROVED' || n.type === 'VIDEO_UNAPPROVED') {
      const approved = n.type === 'VIDEO_APPROVED'
      return `
        <div style="padding:10px 0;">
          <div style="font-size:14px; font-weight:750; color:${EMAIL_BRAND.text}; margin-bottom:4px;">${escapeHtml(n.videoName)}${n.videoLabel ? ` ${escapeHtml(n.videoLabel)}` : ''}</div>
          <div style="font-size:13px; color:${approved ? EMAIL_BRAND.accent : EMAIL_BRAND.muted}; font-weight:600;">${approved ? 'Approved' : 'Approval removed'}</div>
        </div>
      `
    }

    const isReply = n.isReply && n.parentComment
    return `
      <div style="padding:10px 0;">
        <div style="font-size:13px; color:${EMAIL_BRAND.muted}; margin-bottom:6px;">
          ${escapeHtml(n.videoName)}${n.videoLabel ? ` ${escapeHtml(n.videoLabel)}` : ''}${n.timecode ? ` • ${formatTimecodeForEmail(n.timecode)}` : ''}
        </div>
        <div style="font-size:14px; font-weight:750; color:${EMAIL_BRAND.text}; margin-bottom:4px;">${escapeHtml(n.authorName)}</div>
        ${isReply ? `<div style="font-size:12px; color:${EMAIL_BRAND.muted}; margin-bottom:8px;">Replying to ${escapeHtml(n.parentComment!.authorName)} — "${escapeHtml(n.parentComment!.content.substring(0, 60))}${n.parentComment!.content.length > 60 ? '...' : ''}"</div>` : ''}
        <div style="font-size:14px; color:${EMAIL_BRAND.textSubtle}; line-height:1.6; white-space:pre-wrap;">${escapeHtml(n.content || '')}</div>
      </div>
    `
  }).join(`<div style="height:1px; background:${EMAIL_BRAND.border}; margin:6px 0;"></div>`)

  const itemsHtml = `
    <div style="border:1px solid ${EMAIL_BRAND.border}; border-radius:12px; padding:10px 14px; margin-bottom:14px; background:${EMAIL_BRAND.surfaceAlt};">
      ${itemsHtmlContent}
    </div>
  `

  return renderEmailShell({
    companyName,
    title: 'Project Update',
    subtitle: `${summaryText} ${data.period}`,
    preheader: `Updates on ${data.projectTitle}`,
    footerNote: companyName,
    bodyContent: `
      <p style="margin:0 0 20px; font-size:16px; color:${EMAIL_BRAND.text};">
        Hi <strong>${escapeHtml(greeting)}</strong>,
      </p>
      <p style="margin:0 0 24px; font-size:15px; color:${EMAIL_BRAND.textSubtle};">
        Here's what happened on your project:
      </p>
      ${itemsHtml}
      <div style="margin: 28px 0; text-align: center;">
        ${renderEmailButton({ href: data.shareUrl, label: 'View Project' })}
      </div>
      <p style="margin:24px 0 0; font-size:13px; color:${EMAIL_BRAND.muted}; text-align:center; line-height:1.5;">
        You can manage email preferences anytime.
      </p>
      ${data.unsubscribeUrl ? renderUnsubscribeSection(data.unsubscribeUrl) : ''}
    `,
  }).trim()
}

/**
 * Admin summary - multi-project
 */
export function generateAdminSummaryEmail(data: AdminSummaryData): string {
  const companyName = data.companyName || 'ViTransfer'
  const greeting = data.adminName ? data.adminName : 'there'
  const totalComments = data.projects.reduce((sum, p) => sum + p.notifications.length, 0)
  const projectCount = data.projects.length

  const projectsHtml = data.projects.map((project) => {
    const items = project.notifications.map((n, index) => `
      <div style="padding:10px 0;${index > 0 ? ` border-top:1px solid ${EMAIL_BRAND.border}; margin-top:8px;` : ''}">
        <div style="font-size:13px; color:${EMAIL_BRAND.muted}; margin-bottom:6px;">
          ${escapeHtml(n.videoName)}${n.videoLabel ? ` ${escapeHtml(n.videoLabel)}` : ''}${n.timecode ? ` • ${formatTimecodeForEmail(n.timecode)}` : ''}
        </div>
        <div style="margin-bottom:4px;">
          <span style="font-size:14px; font-weight:750; color:${EMAIL_BRAND.text};">${escapeHtml(n.authorName)}</span>
          ${n.authorEmail ? `<span style="font-size:12px; color:${EMAIL_BRAND.muted}; margin-left:6px;">${escapeHtml(n.authorEmail)}</span>` : ''}
        </div>
        <div style="font-size:14px; color:${EMAIL_BRAND.textSubtle}; line-height:1.6; white-space:pre-wrap;">${escapeHtml(n.content || '')}</div>
      </div>
    `).join('')

    return `
      <div style="border:1px solid ${EMAIL_BRAND.border}; border-radius:12px; padding:16px; margin-bottom:16px; background:${EMAIL_BRAND.surfaceAlt};">
        <div style="font-size:15px; font-weight:850; color:${EMAIL_BRAND.text}; margin-bottom:10px;">${escapeHtml(project.projectTitle)}</div>
        ${items}
        <div style="margin-top: 14px; text-align: center;">
          ${renderEmailButton({ href: project.shareUrl, label: 'View Project', variant: 'secondary' })}
        </div>
      </div>
    `
  }).join('')

  const adminUrl = data.projects[0]?.shareUrl ? escapeHtml(data.projects[0].shareUrl.replace(/\/share\/[^/]+/, '/admin/projects')) : '#'

  return renderEmailShell({
    companyName,
    title: 'Client Activity Summary',
    subtitle: `${totalComments} ${totalComments === 1 ? 'comment' : 'comments'} across ${projectCount} ${projectCount === 1 ? 'project' : 'projects'} ${data.period}`,
    preheader: `Client activity summary: ${totalComments} updates`,
    footerNote: companyName,
    bodyContent: `
      <p style="margin:0 0 20px; font-size:16px; color:${EMAIL_BRAND.text};">
        Hi <strong>${escapeHtml(greeting)}</strong>,
      </p>
      <p style="margin:0 0 24px; font-size:15px; color:${EMAIL_BRAND.textSubtle};">
        Here are the latest client comments:
      </p>
      ${projectsHtml}
      <div style="margin: 28px 0; text-align: center;">
        ${renderEmailButton({ href: adminUrl, label: 'Open Admin Dashboard' })}
      </div>
    `,
  }).trim()
}
