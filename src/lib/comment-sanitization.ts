/**
 * Comment Sanitization Utility
 *
 * SECURITY-FIRST: Zero PII exposure policy
 * - Clients NEVER see real names or emails (even on public shares)
 * - Only admins in admin panel get full data for management
 * - All email/notification handling is server-side only
 *
 * Extracted from duplicate code in:
 * - src/app/api/comments/route.ts
 * - src/app/api/comments/[id]/route.ts
 * - src/app/api/share/[token]/comments/route.ts
 */

export function sanitizeComment(
  comment: any,
  isAdmin: boolean,
  isAuthenticated: boolean,
  clientName?: string
) {
  const sanitized: any = {
    id: comment.id,
    projectId: comment.projectId,
    videoId: comment.videoId,
    videoVersion: comment.videoVersion,
    timestamp: comment.timestamp,
    content: comment.content,
    isInternal: comment.isInternal,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    parentId: comment.parentId,
  }

  // NEVER expose real names or emails to non-admins
  // Use generic labels only
  if (isAdmin) {
    // Admins get real data for management purposes only
    sanitized.authorName = comment.authorName
    sanitized.authorEmail = comment.authorEmail
    sanitized.userId = comment.userId
    if (comment.user) {
      sanitized.user = {
        id: comment.user.id,
        name: comment.user.name,
        email: comment.user.email
      }
    }
  } else if (isAuthenticated) {
    // Authenticated share users see author names but never emails
    sanitized.authorName = comment.isInternal
      ? (comment.authorName || 'Admin')
      : (comment.authorName || clientName || 'Client')
  } else {
    // Guests/public: generic labels only, no PII
    sanitized.authorName = comment.isInternal ? 'Admin' : 'Client'
  }

  // Recursively sanitize replies
  if (comment.replies && Array.isArray(comment.replies)) {
    sanitized.replies = comment.replies.map((reply: any) =>
      sanitizeComment(reply, isAdmin, isAuthenticated, clientName)
    )
  }

  return sanitized
}
