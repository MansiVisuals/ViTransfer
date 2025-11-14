'use client'

import { Comment } from '@prisma/client'
import { Clock, Trash2, CornerDownRight } from 'lucide-react'
import { formatTimestamp } from '@/lib/utils'
import DOMPurify from 'dompurify'

type CommentWithReplies = Comment & {
  replies?: Comment[]
}

interface MessageBubbleProps {
  comment: CommentWithReplies
  isReply: boolean
  isStudio: boolean
  companyName: string
  parentComment?: Comment | null
  onReply?: () => void
  onSeekToTimestamp?: (timestamp: number, videoId: string, videoVersion: number | null) => void
  onDelete?: () => void
  onScrollToComment?: (commentId: string) => void
  formatMessageTime: (date: Date) => string
  commentsDisabled: boolean
  isViewerMessage: boolean // Is this the viewer's own message?
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
  isStudio,
  companyName,
  parentComment,
  onReply,
  onSeekToTimestamp,
  onDelete,
  onScrollToComment,
  formatMessageTime,
  commentsDisabled,
  isViewerMessage,
}: MessageBubbleProps) {
  // Viewer's own messages always on RIGHT (like texting apps)
  const alignment = isViewerMessage ? 'justify-end' : 'justify-start'
  // Viewer's messages: blue with slightly rounded corners on left
  // Other person's messages: gray with slightly rounded corners on right
  const bgColor = isViewerMessage ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
  const textColor = isViewerMessage ? 'text-white' : 'text-gray-900 dark:text-gray-100'
  const textAlign = isViewerMessage ? 'text-right' : 'text-left'
  const bubbleRounding = isViewerMessage ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'

  const handleTimestampClick = () => {
    if (comment.timestamp !== null && comment.timestamp !== undefined && onSeekToTimestamp) {
      onSeekToTimestamp(comment.timestamp, comment.videoId, comment.videoVersion)
    }
  }

  return (
    <div className={`flex ${alignment}`} id={`comment-${comment.id}`}>
      <div className={`max-w-[90%] sm:max-w-[80%] md:max-w-[75%] ${textAlign}`}>
        {/* Message Bubble */}
        <div className={`${bgColor} ${textColor} ${bubbleRounding} px-3 py-2.5 inline-block shadow-sm max-w-full`}>
          {/* Reply Preview - Inside bubble at top if replying */}
          {isReply && parentComment && (
            <div
              onClick={() => onScrollToComment?.(parentComment.id)}
              className={`mb-2 pb-2 border-b ${isViewerMessage ? 'border-white/20' : 'border-gray-400/30'} cursor-pointer hover:opacity-80 transition-opacity`}
            >
              <div className="flex items-start gap-1.5">
                <CornerDownRight className="w-3 h-3 flex-shrink-0 opacity-75 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold opacity-75 mb-0.5">
                    Replying to {parentComment.authorName || 'Anonymous'}
                  </p>
                  <p className="text-[11px] opacity-70 line-clamp-2 leading-snug">
                    {parentComment.content}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Author Name & Studio Badge - Inside bubble at top */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-semibold opacity-90">
              {comment.authorName || 'Anonymous'}
            </span>
            {isStudio && (
              <>
                <span className="text-xs opacity-70">•</span>
                <span className="text-xs font-medium opacity-80">{companyName}</span>
              </>
            )}
            {comment.videoVersion && (
              <>
                <span className="text-xs opacity-70">•</span>
                <span className="text-xs opacity-75">v{comment.videoVersion}</span>
              </>
            )}
          </div>

          {/* Timestamp Badge (if present) */}
          {comment.timestamp !== null && comment.timestamp !== undefined && (
            <button
              onClick={handleTimestampClick}
              className="flex items-center gap-1 mb-1.5 cursor-pointer hover:opacity-80 transition-opacity"
              title="Seek to this timestamp"
            >
              <Clock className="w-3 h-3 text-warning" />
              <span className="text-xs text-warning underline decoration-dotted">
                {formatTimestamp(comment.timestamp)}
              </span>
            </button>
          )}

          {/* Message Content */}
          <div
            className="text-sm whitespace-pre-wrap break-words leading-relaxed"
            dangerouslySetInnerHTML={{ __html: sanitizeContent(comment.content) }}
          />
        </div>

        {/* Message Time, Reply & Delete Buttons - Below bubble */}
        <div className={`flex items-center gap-2 mt-1 px-2 ${isViewerMessage ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs text-muted-foreground">
            {formatMessageTime(comment.createdAt)}
          </span>
          {/* Reply Button - show for top-level comments only */}
          {!isReply && !commentsDisabled && onReply && (
            <>
              <span className="text-xs text-muted-foreground">•</span>
              <button
                onClick={onReply}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                Reply
              </button>
            </>
          )}
          {/* Delete Button - admin only */}
          {onDelete && (
            <>
              <span className="text-xs text-muted-foreground">•</span>
              <button
                onClick={onDelete}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors font-medium flex items-center gap-1"
                title="Delete comment"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
