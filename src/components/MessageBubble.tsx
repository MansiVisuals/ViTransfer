'use client'

import { Comment } from '@prisma/client'
import { Clock, Trash2, CornerDownRight } from 'lucide-react'
import { getUserColor } from '@/lib/utils'
import { timecodeToSeconds, formatTimecodeDisplay } from '@/lib/timecode'
import DOMPurify from 'dompurify'

type CommentWithReplies = Comment & {
  replies?: Comment[]
}

interface MessageBubbleProps {
  comment: CommentWithReplies
  isReply: boolean
  isStudio: boolean
  studioCompanyName: string
  clientCompanyName?: string | null
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
  studioCompanyName,
  clientCompanyName,
  parentComment,
  onReply,
  onSeekToTimestamp,
  onDelete,
  onScrollToComment,
  formatMessageTime,
  commentsDisabled,
  isViewerMessage,
}: MessageBubbleProps) {
  // Determine which company name to show
  const displayCompanyName = isStudio ? studioCompanyName : clientCompanyName

  // Viewer's own messages on RIGHT, others on LEFT
  const alignment = isViewerMessage ? 'justify-end' : 'justify-start'
  const headerAlign = isViewerMessage ? 'flex-row-reverse' : 'flex-row'

  // Bubble colors:
  // Sender (your messages): Blue bubble with vibrant border per person
  // Received (others): Gray bubble with vibrant colored border per person
  // Both: Text is black-ish in light mode, white in dark mode

  // Get effective author name for color generation
  // For internal comments without authorName, fall back to user.name or user.email
  const effectiveAuthorName = comment.authorName ||
    (comment.isInternal && (comment as any).user ?
      ((comment as any).user.name || (comment as any).user.email) :
      null)

  const userColor = getUserColor(effectiveAuthorName, isViewerMessage)
  const borderColor = userColor.border

  let bubbleBg: string
  if (isViewerMessage) {
    // Your messages: Blue background
    bubbleBg = 'bg-blue-500 dark:bg-blue-600'
  } else {
    // Received messages: Neutral gray background (more contrast in light mode)
    bubbleBg = 'bg-gray-200 dark:bg-gray-800'
  }

  // Text color adapts to light/dark mode (same for both sender and receiver)
  const textColor = 'text-gray-900 dark:text-gray-100'

  const handleTimestampClick = () => {
    if (comment.timecode && onSeekToTimestamp) {
      // Convert timecode to seconds for video player seeking
      // Use 24fps as default (video player will handle the actual seek)
      const seconds = timecodeToSeconds(comment.timecode, 24)
      onSeekToTimestamp(seconds, comment.videoId, comment.videoVersion)
    }
  }

  return (
    <div className={`flex ${alignment} w-full`} id={`comment-${comment.id}`}>
      <div className="max-w-[85%] md:max-w-[75%]">
        {/* Name and version header */}
        <div className={`flex ${headerAlign} items-center gap-2 mb-1 px-1`}>
          <span className="text-sm font-semibold text-foreground">
            {effectiveAuthorName || 'Anonymous'}
          </span>
          {displayCompanyName && (
            <>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{displayCompanyName}</span>
            </>
          )}
          {comment.videoVersion && (
            <>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">v{comment.videoVersion}</span>
            </>
          )}
        </div>

        {/* Message Card with colored left border */}
        <div className={`${bubbleBg} ${borderColor} border-l-4 rounded-lg p-3 shadow-sm`}>
          {/* Reply Preview at top if replying */}
          {isReply && parentComment && (() => {
            // Get effective parent author name
            const parentEffectiveName = parentComment.authorName ||
              (parentComment.isInternal && (parentComment as any).user ?
                ((parentComment as any).user.name || (parentComment as any).user.email) :
                null)

            return (
              <div
                onClick={() => onScrollToComment?.(parentComment.id)}
                className="mb-2 pb-2 border-b border-gray-400/60 dark:border-gray-500/60 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <div className="flex items-start gap-1.5">
                  <CornerDownRight className="w-3 h-3 flex-shrink-0 mt-0.5 text-gray-600 dark:text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold mb-0.5 text-gray-700 dark:text-gray-300">
                      Replying to {parentEffectiveName || 'Anonymous'}
                    </p>
                    <p className="text-xs line-clamp-2 leading-snug text-gray-600 dark:text-gray-400">
                      {parentComment.content}
                    </p>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Timecode Badge (if present) */}
          {comment.timecode && (
            <button
              onClick={handleTimestampClick}
              className="flex items-center gap-1 mb-2 cursor-pointer hover:opacity-80 transition-opacity"
              title="Seek to this timecode"
            >
              <Clock className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
              <span className="text-xs underline decoration-dotted font-medium text-orange-600 dark:text-orange-400">
                {formatTimecodeDisplay(comment.timecode, true, true)}
              </span>
            </button>
          )}

          {/* Message Content */}
          <div
            className={`text-sm whitespace-pre-wrap break-words leading-relaxed ${textColor}`}
            dangerouslySetInnerHTML={{ __html: sanitizeContent(comment.content) }}
          />
        </div>

        {/* Message Time, Reply & Delete Buttons - Below card */}
        <div className={`flex items-center gap-2 mt-1 px-1 ${isViewerMessage ? 'justify-end' : 'justify-start'}`}>
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
