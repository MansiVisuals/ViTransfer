/**
 * Ultra-Compact Email Templates for Notification System
 * Clean, minimal, and easy to scan
 */

import { escapeHtml, renderEmailShell } from './email'
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
  projectTitle: string
  shareUrl: string
  recipientName: string
  recipientEmail: string
  period: string
  notifications: NotificationData[]
}

interface AdminSummaryData {
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
          <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#2563eb; margin-bottom:4px;">Project approved</div>
          <div style="font-size:14px; color:#111827;">All videos are ready for download.</div>
        </div>
      `
    }

    if (n.type === 'VIDEO_APPROVED' || n.type === 'VIDEO_UNAPPROVED') {
      const approved = n.type === 'VIDEO_APPROVED'
      return `
        <div style="padding:10px 0;">
          <div style="font-size:14px; font-weight:700; color:#111827; margin-bottom:2px;">${escapeHtml(n.videoName)}${n.videoLabel ? ` ${escapeHtml(n.videoLabel)}` : ''}</div>
          <div style="font-size:13px; color:${approved ? '#15803d' : '#b45309'};">${approved ? 'Approved' : 'Approval removed'}</div>
        </div>
      `
    }

    const isReply = n.isReply && n.parentComment
    return `
      <div style="padding:10px 0;">
        <div style="font-size:13px; color:#6b7280; margin-bottom:4px;">
          ${escapeHtml(n.videoName)}${n.videoLabel ? ` ${escapeHtml(n.videoLabel)}` : ''}${n.timecode ? ` • ${formatTimecodeForEmail(n.timecode)}` : ''}
        </div>
        <div style="font-size:14px; font-weight:700; color:#111827; margin-bottom:2px;">${escapeHtml(n.authorName)}</div>
        ${isReply ? `<div style="font-size:12px; color:#6b7280; margin-bottom:6px;">Replying to ${escapeHtml(n.parentComment!.authorName)} — "${escapeHtml(n.parentComment!.content.substring(0, 60))}${n.parentComment!.content.length > 60 ? '...' : ''}"</div>` : ''}
        <div style="font-size:14px; color:#374151; line-height:1.6; white-space:pre-wrap;">${escapeHtml(n.content || '')}</div>
      </div>
    `
  }).join('<div style="height:1px; background:#e5e7eb; margin:6px 0;"></div>')

  const itemsHtml = `
    <div style="border:1px solid #e2e8f0; border-radius:12px; padding:10px 14px; margin-bottom:14px;">
      ${itemsHtmlContent}
    </div>
  `

  return renderEmailShell({
    companyName: 'Project Updates',
    headerGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    title: 'Project Update',
    subtitle: `${summaryText} ${data.period}`,
    footerNote: 'Project Updates',
    bodyContent: `
      <p style="margin:0 0 20px; font-size:16px;">
        Hi <strong>${escapeHtml(greeting)}</strong>,
      </p>
      <p style="margin:0 0 24px; font-size:15px;">
        Here's what happened on your project:
      </p>
      ${itemsHtml}
      <div style="text-align:center; margin:32px 0;">
        <a href="${escapeHtml(data.shareUrl)}" style="display:inline-block; background:#3b82f6; color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:8px; font-size:16px; font-weight:600; box-shadow:0 4px 12px rgba(59,130,246,0.3);">
          View Project
        </a>
      </div>
      <p style="margin:24px 0 0; font-size:13px; color:#9ca3af; text-align:center; line-height:1.5;">
        Reply to this email to unsubscribe from project updates.
      </p>
    `,
  }).trim()
}

/**
 * Admin summary - multi-project
 */
export function generateAdminSummaryEmail(data: AdminSummaryData): string {
  const greeting = data.adminName ? data.adminName : 'there'
  const totalComments = data.projects.reduce((sum, p) => sum + p.notifications.length, 0)
  const projectCount = data.projects.length

  const projectsHtml = data.projects.map((project) => {
    const items = project.notifications.map((n, index) => `
      <div style="padding:10px 0;${index > 0 ? ' border-top:1px solid #e5e7eb; margin-top:8px;' : ''}">
        <div style="font-size:13px; color:#6b7280; margin-bottom:4px;">
          ${escapeHtml(n.videoName)}${n.videoLabel ? ` ${escapeHtml(n.videoLabel)}` : ''}${n.timecode ? ` • ${formatTimecodeForEmail(n.timecode)}` : ''}
        </div>
        <div style="margin-bottom:4px;">
          <span style="font-size:14px; font-weight:700; color:#111827;">${escapeHtml(n.authorName)}</span>
          ${n.authorEmail ? `<span style="font-size:12px; color:#6b7280; margin-left:6px;">${escapeHtml(n.authorEmail)}</span>` : ''}
        </div>
        <div style="font-size:14px; color:#374151; line-height:1.6; white-space:pre-wrap;">${escapeHtml(n.content || '')}</div>
      </div>
    `).join('')

    return `
      <div style="border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:16px; background:#f9fafb;">
        <div style="font-size:15px; font-weight:800; color:#111827; margin-bottom:8px;">${escapeHtml(project.projectTitle)}</div>
        ${items}
        <div style="margin-top:12px; text-align:center;">
          <a href="${escapeHtml(project.shareUrl)}" style="display:inline-flex; align-items:center; gap:8px; color:#111827; text-decoration:none; padding:10px 22px; border-radius:999px; border:1px solid #111827; font-weight:700; font-size:14px;">
            View project<span style="font-size:16px;">→</span>
          </a>
        </div>
      </div>
    `
  }).join('')

  const adminUrl = data.projects[0]?.shareUrl ? escapeHtml(data.projects[0].shareUrl.replace(/\/share\/[^/]+/, '/admin/projects')) : '#'

  return renderEmailShell({
    companyName: 'Admin Dashboard',
    headerGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    title: 'Client Activity Summary',
    subtitle: `${totalComments} ${totalComments === 1 ? 'comment' : 'comments'} across ${projectCount} ${projectCount === 1 ? 'project' : 'projects'} ${data.period}`,
    footerNote: 'Admin Notifications',
    bodyContent: `
      <p style="margin:0 0 20px; font-size:16px;">
        Hi <strong>${escapeHtml(greeting)}</strong>,
      </p>
      <p style="margin:0 0 24px; font-size:15px;">
        Here are the latest client comments:
      </p>
      ${projectsHtml}
      <div style="text-align:center; margin:32px 0;">
        <a href="${adminUrl}" style="display:inline-block; background:#f59e0b; color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:8px; font-size:16px; font-weight:600; box-shadow:0 4px 12px rgba(245,158,11,0.3);">
          Open Admin Dashboard
        </a>
      </div>
    `,
  }).trim()
}
