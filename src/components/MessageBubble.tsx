'use client'

import { Comment } from '@prisma/client'
import { Clock, Trash2 } from 'lucide-react'
import DOMPurify from 'dompurify'
import { InitialsAvatar } from '@/components/InitialsAvatar'
import CommentAttachments from './CommentAttachments'

type CommentWithReplies = Comment & {
  replies?: Comment[]
}

interface MessageBubbleProps {
  comment: CommentWithReplies
  isReply: boolean
  onReply?: () => void
  onSeekToTimecode?: (timecode: string, videoId: string, videoVersion: number | null) => void
  onDelete?: () => void
  formatMessageTime: (date: Date) => string
  commentsDisabled: boolean
  sequenceNumber?: number
  replies?: Comment[]
  onDeleteReply?: (replyId: string) => void
  timestampLabel?: string | null
  shareToken?: string | null
}

/**
 * Sanitize HTML content for display
 * Defense in depth: Even though content is sanitized on backend,
 * we sanitize again on frontend for extra security
 */
function sanitizeContent(content: string): string {
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i, // Only allow https://, http://, mailto: URLs
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['rel'], // Add rel="noopener noreferrer" to all links for security
    FORCE_BODY: true, // Parse content as body to prevent context-breaking attacks
  })
}

export default function MessageBubble({
  comment,
  isReply,
  onReply,
  onSeekToTimecode,
  onDelete,
  formatMessageTime,
  commentsDisabled,
  sequenceNumber,
  replies,
  onDeleteReply,
  timestampLabel,
  shareToken,
}: MessageBubbleProps) {
  // Get effective author name for color generation
  // For internal comments without authorName, fall back to user.name or user.email
  const effectiveAuthorName = comment.authorName ||
    (comment.isInternal && (comment as any).user ?
      ((comment as any).user.name || (comment as any).user.email) :
      null)

  const handleTimestampClick = () => {
    if (comment.timecode && onSeekToTimecode) {
      onSeekToTimecode(comment.timecode, comment.videoId, comment.videoVersion)
    }
  }

  const threadReplies = !isReply && replies && replies.length > 0 ? replies : []
  const hasReplies = threadReplies.length > 0

  return (
    <div className="w-full" id={`comment-${comment.id}`}>
      <div className="bg-card border border-border/50 rounded-lg p-4 shadow-elevation-sm relative">
        {hasReplies && (
          <div className="absolute left-9 top-12 bottom-10 w-px bg-border/50" aria-hidden="true" />
        )}

        <div className="grid grid-cols-[40px_1fr] gap-x-3 gap-y-6 items-start">
          <div className="flex justify-center">
            <InitialsAvatar name={effectiveAuthorName} size="md" isInternal={comment.isInternal ?? false} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 min-w-0">
              <span className="text-base font-semibold text-foreground truncate">
                {effectiveAuthorName || 'Anonymous'}
              </span>
              <span className="text-sm text-muted-foreground flex-shrink-0">
                {formatMessageTime(comment.createdAt)}
              </span>
            </div>

            <div className="text-base text-foreground whitespace-pre-wrap break-words leading-relaxed">
              {!isReply && timestampLabel && (
                <button
                  type="button"
                  onClick={handleTimestampClick}
                  className="inline-flex items-center gap-1 rounded-md bg-warning-visible px-2 py-1 text-sm font-semibold text-warning mr-2 align-top hover:opacity-90 transition-opacity"
                  title="Seek to this timecode"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span className="font-mono">{timestampLabel}</span>
                </button>
              )}

              <div
                className={`${!isReply && timestampLabel ? 'inline' : ''} [&>p]:m-0 [&>p:first-child]:inline [&>br]:leading-[0]`}
                dangerouslySetInnerHTML={{ __html: sanitizeContent(comment.content) }}
              />
            </div>

            {(comment as any).assets && (comment as any).assets.length > 0 && (
              <CommentAttachments
                assets={(comment as any).assets}
                videoId={comment.videoId}
                shareToken={shareToken}
              />
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {!isReply && !commentsDisabled && onReply && (
                  <button
                    onClick={onReply}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
                  >
                    Reply
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="text-sm text-muted-foreground hover:text-destructive transition-colors font-medium flex items-center gap-1"
                    title="Delete comment"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </div>
              {typeof sequenceNumber === 'number' && sequenceNumber > 0 && (
                <span className="text-sm text-muted-foreground">
                  #{sequenceNumber}
                </span>
              )}
            </div>
          </div>

          {threadReplies.map((reply) => {
            const replyEffectiveName = reply.authorName ||
              (reply.isInternal && (reply as any).user ?
                ((reply as any).user.name || (reply as any).user.email) :
                null)

            return (
              <div key={reply.id} className="contents">
                <div className="flex justify-center">
                  <InitialsAvatar name={replyEffectiveName} size="md" isInternal={reply.isInternal ?? false} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2 min-w-0">
                    <span className="text-base font-semibold text-foreground truncate">
                      {replyEffectiveName || 'Anonymous'}
                    </span>
                    <span className="text-sm text-muted-foreground flex-shrink-0">
                      {formatMessageTime(reply.createdAt)}
                    </span>
                    {onDeleteReply && (
                      <button
                        onClick={() => onDeleteReply(reply.id)}
                        className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete reply"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div
                    className="text-base text-foreground whitespace-pre-wrap break-words leading-relaxed [&>p]:m-0"
                    dangerouslySetInnerHTML={{ __html: sanitizeContent(reply.content) }}
                  />
                  {(reply as any).assets && (reply as any).assets.length > 0 && (
                    <CommentAttachments
                      assets={(reply as any).assets}
                      videoId={reply.videoId}
                      shareToken={shareToken}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
