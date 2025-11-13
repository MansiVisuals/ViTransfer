'use client'

import { Comment } from '@prisma/client'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Input } from './ui/input'
import { Clock, Send } from 'lucide-react'
import { formatTimestamp } from '@/lib/utils'

interface CommentInputProps {
  newComment: string
  onCommentChange: (value: string) => void
  onSubmit: () => void
  loading: boolean

  // Timestamp
  selectedTimestamp: number | null
  onClearTimestamp: () => void

  // Reply state
  replyingToComment: Comment | null
  onCancelReply: () => void

  // Author name (for clients on password-protected shares)
  showAuthorInput: boolean
  authorName: string
  onAuthorNameChange: (value: string) => void
  namedRecipients: Array<{ id: string; name: string | null }>
  nameSource: 'recipient' | 'custom'
  selectedRecipientId: string
  onNameSourceChange: (source: 'recipient' | 'custom', recipientId?: string) => void

  // Restrictions
  currentVideoRestricted: boolean
  restrictionMessage?: string
  commentsDisabled: boolean
}

export default function CommentInput({
  newComment,
  onCommentChange,
  onSubmit,
  loading,
  selectedTimestamp,
  onClearTimestamp,
  replyingToComment,
  onCancelReply,
  showAuthorInput,
  authorName,
  onAuthorNameChange,
  namedRecipients,
  nameSource,
  selectedRecipientId,
  onNameSourceChange,
  currentVideoRestricted,
  restrictionMessage,
  commentsDisabled,
}: CommentInputProps) {
  if (commentsDisabled) return null

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="border-t border-border p-4 bg-card flex-shrink-0">
      {/* Restriction Warning */}
      {currentVideoRestricted && restrictionMessage && (
        <div className="mb-3 p-3 bg-warning-visible border-2 border-warning-visible rounded-lg">
          <p className="text-sm text-warning font-medium flex items-center gap-2">
            <span className="font-semibold">Comments Restricted</span>
          </p>
          <p className="text-xs text-warning font-medium mt-1">
            {restrictionMessage}
          </p>
        </div>
      )}

      {/* Replying To Indicator */}
      {replyingToComment && (
        <div className="mb-3 p-3 bg-gray-100 dark:bg-gray-800 border-l-2 border-blue-400 rounded-lg flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-700 dark:text-gray-300 font-semibold mb-1">
              Replying to {replyingToComment.authorName || 'Anonymous'}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 leading-snug">
              {replyingToComment.content}
            </p>
          </div>
          <button
            onClick={onCancelReply}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium flex-shrink-0 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Author Info - Only show for password-protected shares (not for admin users) */}
      {!currentVideoRestricted && showAuthorInput && (
        <div className="mb-3 space-y-2">
          {namedRecipients.length > 0 ? (
            <>
              <select
                value={nameSource === 'recipient' && selectedRecipientId ? selectedRecipientId : nameSource === 'custom' ? 'custom' : 'placeholder'}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    onNameSourceChange('custom')
                  } else if (e.target.value === 'placeholder') {
                    // Do nothing, just keep placeholder selected
                  } else {
                    onNameSourceChange('recipient', e.target.value)
                  }
                }}
                className="w-full px-3 py-2 text-sm bg-card border border-border rounded-md"
              >
                <option value="placeholder">Select a name...</option>
                {namedRecipients.map((recipient) => (
                  <option key={recipient.id} value={recipient.id}>
                    {recipient.name}
                  </option>
                ))}
                <option value="custom">Custom Name...</option>
              </select>

              {nameSource === 'custom' && (
                <Input
                  placeholder="Enter your name"
                  value={authorName}
                  onChange={(e) => onAuthorNameChange(e.target.value)}
                  className="text-sm"
                  autoFocus
                />
              )}
            </>
          ) : (
            <Input
              placeholder="Your name (optional)"
              value={authorName}
              onChange={(e) => onAuthorNameChange(e.target.value)}
              className="text-sm"
            />
          )}
        </div>
      )}

      {/* Timestamp indicator */}
      {selectedTimestamp !== null && selectedTimestamp !== undefined && !currentVideoRestricted && (
        <div className="flex items-center gap-2 mb-2 text-sm">
          <Clock className="w-4 h-4 text-warning" />
          <span className="text-warning">
            Comment at {formatTimestamp(selectedTimestamp)}
          </span>
          <Button
            onClick={onClearTimestamp}
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
          >
            Clear
          </Button>
        </div>
      )}

      {/* Message Input */}
      {!currentVideoRestricted && (
        <>
          <div className="flex gap-2">
            <Textarea
              placeholder="Type your message..."
              value={newComment}
              onChange={(e) => onCommentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="resize-none"
              rows={2}
            />
            <Button
              onClick={onSubmit}
              variant="default"
              disabled={loading || !newComment.trim()}
              className="self-end"
              size="icon"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </>
      )}
    </div>
  )
}
