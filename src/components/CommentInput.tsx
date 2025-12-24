'use client'

import { Comment } from '@prisma/client'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Input } from './ui/input'
import { Clock, Send } from 'lucide-react'
import { secondsToTimecode, formatTimecodeDisplay, getTimecodeLabel, isDropFrame } from '@/lib/timecode'

interface CommentInputProps {
  newComment: string
  onCommentChange: (value: string) => void
  onSubmit: () => void
  loading: boolean

  // Timestamp
  selectedTimestamp: number | null
  onClearTimestamp: () => void
  selectedVideoFps: number // FPS of the currently selected video

  // Reply state
  replyingToComment: Comment | null
  onCancelReply: () => void

  // Author name (for clients on password-protected shares)
  showAuthorInput: boolean
  authorName: string
  onAuthorNameChange: (value: string) => void
  namedRecipients: Array<{ id: string; name: string | null }>
  nameSource: 'recipient' | 'custom' | 'none'
  selectedRecipientId: string
  onNameSourceChange: (source: 'recipient' | 'custom' | 'none', recipientId?: string) => void

  // Restrictions
  currentVideoRestricted: boolean
  restrictionMessage?: string
  commentsDisabled: boolean

  // Optional shortcuts UI (share pages)
  showShortcutsButton?: boolean
  onShowShortcuts?: () => void
}

export default function CommentInput({
  newComment,
  onCommentChange,
  onSubmit,
  loading,
  selectedTimestamp,
  onClearTimestamp,
  selectedVideoFps,
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
  showShortcutsButton = false,
  onShowShortcuts,
}: CommentInputProps) {
  if (commentsDisabled) return null

  // Check if name selection is required but not provided
  const isNameRequired = showAuthorInput && namedRecipients.length > 0 && nameSource === 'none'
  const canSubmit = !loading && newComment.trim() && !isNameRequired

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Allow Ctrl+Space and other Ctrl shortcuts to pass through to VideoPlayer
    if (e.ctrlKey) {
      // Don't handle Ctrl shortcuts here - let them bubble to VideoPlayer
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      // Prevent multiple submissions while loading
      if (canSubmit) {
        onSubmit()
      }
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
                value={nameSource === 'recipient' && selectedRecipientId ? selectedRecipientId : nameSource === 'custom' ? 'custom' : 'none'}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    onNameSourceChange('custom')
                  } else if (e.target.value === 'none') {
                    onNameSourceChange('none')
                  } else {
                    onNameSourceChange('recipient', e.target.value)
                  }
                }}
                className="w-full px-3 py-2 text-sm bg-card border border-border rounded-md"
              >
                <option value="none">Select a name...</option>
                {namedRecipients.map((recipient) => (
                  <option key={recipient.id} value={recipient.id}>
                    {recipient.name}
                  </option>
                ))}
                <option value="custom">Custom Name</option>
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

      {/* Timecode indicator */}
      {selectedTimestamp !== null && selectedTimestamp !== undefined && !currentVideoRestricted && (
        <div className="mb-2">
          {/* Format hint - aligned to match timecode position */}
          <div className="flex items-center gap-3 mb-0.5 ml-7">
            <span className="text-sm text-muted-foreground/60 font-mono">
              {isDropFrame(selectedVideoFps) ? 'HH:MM:SS;FF' : 'HH:MM:SS:FF'}
            </span>
            <span className="text-sm text-muted-foreground/50">
              (Hours:Minutes:Seconds{isDropFrame(selectedVideoFps) ? ';' : ':'}Frames)
            </span>
          </div>
          {/* Timecode value with clock and clear button */}
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-warning flex-shrink-0" />
            <span className="text-warning font-mono text-sm">
              {formatTimecodeDisplay(secondsToTimecode(selectedTimestamp, selectedVideoFps))}
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
              disabled={!canSubmit}
              className="self-end"
              size="icon"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>

          {isNameRequired ? (
            <p className="text-xs text-warning mt-2">
              Please select your name from the dropdown above before sending
            </p>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Press Enter to send & Shift+Enter for new line
              </p>
              {showShortcutsButton && onShowShortcuts && (
                <Button type="button" variant="ghost" size="xs" onClick={onShowShortcuts}>
                  Shortcuts
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
