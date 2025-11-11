/**
 * Ultra-Compact Email Templates for Notification System
 * Clean, minimal, and easy to scan
 */

import { escapeHtml } from './email'

interface NotificationData {
  type: 'CLIENT_COMMENT' | 'ADMIN_REPLY' | 'VIDEO_APPROVED' | 'VIDEO_UNAPPROVED' | 'PROJECT_APPROVED'
  videoName: string
  videoLabel?: string
  authorName: string
  authorEmail?: string
  content?: string
  timestamp?: number
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

function formatTimestamp(seconds?: number | null): string {
  if (seconds === null || seconds === undefined) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
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
  const summaryText = summaryParts.join(', ')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 32px 24px; text-align: center;">
      <div style="font-size: 24px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">Project Update</div>
      <div style="font-size: 15px; color: rgba(255,255,255,0.95);">${summaryText} ${data.period}</div>
    </div>

    <!-- Content -->
    <div style="padding: 32px 24px;">
      <p style="margin: 0 0 20px 0; font-size: 16px; color: #111827; line-height: 1.5;">
        Hi <strong>${escapeHtml(greeting)}</strong>,
      </p>

      <p style="margin: 0 0 24px 0; font-size: 15px; color: #374151; line-height: 1.6;">
        Here's what happened on <strong>${escapeHtml(data.projectTitle)}</strong>:
      </p>

      <div style="background: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
        ${data.notifications.map((n, i) => {
        // Project Approved
        if (n.type === 'PROJECT_APPROVED') {
          return `
            <div style="margin-bottom: 12px; padding: 16px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px;">
              <div style="font-size: 14px; font-weight: 600; color: #065f46; margin-bottom: 4px;">Project Approved</div>
              <div style="font-size: 13px; color: #166534;">All videos are ready for download</div>
            </div>
          `
        }

        // Video Approved/Unapproved
        if (n.type === 'VIDEO_APPROVED' || n.type === 'VIDEO_UNAPPROVED') {
          const approved = n.type === 'VIDEO_APPROVED'
          return `
            <div style="margin-bottom: 12px; padding: 16px; background: ${approved ? '#f0fdf4' : '#fef3c7'}; border: 1px solid ${approved ? '#86efac' : '#fbbf24'}; border-radius: 6px;">
              <div style="font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 4px;">${escapeHtml(n.videoName)}${n.videoLabel ? ` ${escapeHtml(n.videoLabel)}` : ''}</div>
              <div style="font-size: 13px; color: ${approved ? '#065f46' : '#92400e'};">${approved ? 'Approved' : 'Approval removed'}</div>
            </div>
          `
        }

        // Comments
        const isReply = n.isReply
        const bg = n.type === 'ADMIN_REPLY' ? '#eff6ff' : '#f3f4f6'
        const borderColor = n.type === 'ADMIN_REPLY' ? '#3b82f6' : '#6b7280'

        return `
          <div style="margin-bottom: 12px; padding: 16px; background: ${bg}; border-left: 3px solid ${borderColor}; border-radius: 6px;">
            ${isReply && n.parentComment ? `
              <div style="margin-bottom: 8px; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 4px; font-size: 12px; color: #6b7280;">
                <div style="font-weight: 600; margin-bottom: 2px;">↩ Replying to ${escapeHtml(n.parentComment.authorName)}</div>
                <div style="font-style: italic;">"${escapeHtml(n.parentComment.content.substring(0, 60))}${n.parentComment.content.length > 60 ? '...' : ''}"</div>
              </div>
            ` : ''}
            <div style="font-size: 13px; font-weight: 600; color: #6b7280; margin-bottom: 4px;">
              ${escapeHtml(n.videoName)}${n.videoLabel ? ` ${escapeHtml(n.videoLabel)}` : ''}${n.timestamp ? ` • ${formatTimestamp(n.timestamp)}` : ''}
            </div>
            <div style="font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 6px;">${escapeHtml(n.authorName)}</div>
            <div style="font-size: 14px; color: #374151; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(n.content || '')}</div>
          </div>
        `
      }).join('')}
      </div>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${escapeHtml(data.shareUrl)}" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 4px rgba(59,130,246,0.2);">
          View Project
        </a>
      </div>

      <p style="margin: 24px 0 0 0; font-size: 13px; color: #9ca3af; line-height: 1.5; text-align: center;">
        You're receiving this because you're a recipient on this project.<br>
        <span style="font-weight: 600;">Don't want these emails?</span> Reply to unsubscribe.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim()
}

/**
 * Admin summary - multi-project
 */
export function generateAdminSummaryEmail(data: AdminSummaryData): string {
  const greeting = data.adminName ? data.adminName : 'there'
  const totalComments = data.projects.reduce((sum, p) => sum + p.notifications.length, 0)
  const projectCount = data.projects.length

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 32px 24px; text-align: center;">
      <div style="font-size: 24px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">Client Activity Summary</div>
      <div style="font-size: 15px; color: rgba(255,255,255,0.95);">${totalComments} ${totalComments === 1 ? 'comment' : 'comments'} across ${projectCount} ${projectCount === 1 ? 'project' : 'projects'} ${data.period}</div>
    </div>

    <!-- Content -->
    <div style="padding: 32px 24px;">
      <p style="margin: 0 0 24px 0; font-size: 16px; color: #111827; line-height: 1.5;">
        Hi <strong>${escapeHtml(greeting)}</strong>,
      </p>

      ${data.projects.map((project, projectIndex) => `
        <div style="margin-bottom: 24px; padding: 20px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb;">
            <div style="font-size: 17px; font-weight: 700; color: #111827;">${escapeHtml(project.projectTitle)}</div>
          </div>

          ${project.notifications.map((n, i) => `
            <div style="margin-top: ${i > 0 ? '12px' : '0'}; padding: 14px; background: #ffffff; border-left: 3px solid #f59e0b; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
              <div style="font-size: 13px; font-weight: 600; color: #6b7280; margin-bottom: 6px;">
                ${escapeHtml(n.videoName)}${n.videoLabel ? ` ${escapeHtml(n.videoLabel)}` : ''}${n.timestamp ? ` • ${formatTimestamp(n.timestamp)}` : ''}
              </div>
              <div style="margin-bottom: 6px;">
                <span style="font-size: 15px; font-weight: 600; color: #111827;">${escapeHtml(n.authorName)}</span>
                ${n.authorEmail ? `<span style="font-size: 13px; color: #6b7280; margin-left: 6px;">${escapeHtml(n.authorEmail)}</span>` : ''}
              </div>
              <div style="font-size: 14px; color: #374151; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(n.content || '')}</div>
            </div>
          `).join('')}

          <div style="margin-top: 16px; text-align: center;">
            <a href="${escapeHtml(project.shareUrl)}" style="display: inline-block; background: #f59e0b; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600;">
              View Project
            </a>
          </div>
        </div>
      `).join('')}

      <div style="text-align: center; margin-top: 32px;">
        <a href="${data.projects[0]?.shareUrl ? escapeHtml(data.projects[0].shareUrl.replace(/\/share\/[^/]+/, '/admin')) : '#'}" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 15px; font-weight: 600; box-shadow: 0 2px 4px rgba(59,130,246,0.2);">
          Open Admin Dashboard
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 20px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; font-size: 13px; color: #9ca3af;">
        Automated summary notification
      </p>
    </div>

  </div>
</body>
</html>
  `.trim()
}
