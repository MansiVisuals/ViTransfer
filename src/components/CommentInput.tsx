'use client'

import { Comment } from '@prisma/client'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Clock, Send, X, Keyboard, Paperclip } from 'lucide-react'
import { formatCommentTimestamp, secondsToTimecode } from '@/lib/timecode'
import { InitialsAvatar } from '@/components/InitialsAvatar'
import CommentAttachmentButton from './CommentAttachmentButton'

interface CommentInputProps {
  newComment: string
  onCommentChange: (value: string) => void
  onSubmit: () => void
  loading: boolean

  // Timestamp
  selectedTimestamp: number | null
  onClearTimestamp: () => void
  selectedVideoFps: number // FPS of the currently selected video
  selectedVideoDurationSeconds?: number | null
  timestampDisplayMode?: 'TIMECODE' | 'AUTO'

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
  isOtpAuthenticated?: boolean

  // Restrictions
  currentVideoRestricted: boolean
  restrictionMessage?: string
  commentsDisabled: boolean

  // Attachments
  allowClientAssetUpload?: boolean
  selectedVideoId?: string | null
  pendingAttachments?: Array<{ assetId: string; videoId: string; fileName: string; fileSize: string; fileType: string; category: string }>
  onAttachmentAdded?: (attachment: { assetId: string; videoId: string; fileName: string; fileSize: string; fileType: string; category: string }) => void
  onRemoveAttachment?: (assetId: string) => void
  attachmentError?: string | null
  attachmentNotice?: string | null
  onAttachmentErrorChange?: (message: string | null) => void
  shareToken?: string | null
  maxCommentAttachments?: number

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
  selectedVideoDurationSeconds = null,
  timestampDisplayMode = 'TIMECODE',
  replyingToComment,
  onCancelReply,
  showAuthorInput,
  authorName,
  onAuthorNameChange,
  namedRecipients,
  nameSource,
  selectedRecipientId,
  onNameSourceChange,
  isOtpAuthenticated = false,
  currentVideoRestricted,
  restrictionMessage,
  commentsDisabled,
  allowClientAssetUpload = false,
  selectedVideoId: selectedVideoIdProp = null,
  pendingAttachments = [],
  onAttachmentAdded,
  onRemoveAttachment,
  attachmentError = null,
  attachmentNotice = null,
  onAttachmentErrorChange,
  shareToken = null,
  maxCommentAttachments,
  showShortcutsButton = false,
  onShowShortcuts,
}: CommentInputProps) {
  if (commentsDisabled) return null

  // Check if name selection is required but not provided
  const isNameRequired = showAuthorInput && namedRecipients.length > 0 && nameSource === 'none'
  const hasAttachments = pendingAttachments.length > 0
  const canSubmit = !loading && (newComment.trim() || hasAttachments) && !isNameRequired
  const timestampLabel =
    selectedTimestamp !== null && selectedTimestamp !== undefined
      ? formatCommentTimestamp({
          timecode: secondsToTimecode(selectedTimestamp, selectedVideoFps),
          fps: selectedVideoFps,
          videoDurationSeconds: selectedVideoDurationSeconds,
          mode: timestampDisplayMode,
        })
      : null

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
        <div className="mb-3 p-3 bg-muted/30 border border-border rounded-lg flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <InitialsAvatar name={replyingToComment.authorName || 'Anonymous'} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground font-semibold mb-1 truncate">
                Replying to {replyingToComment.authorName || 'Anonymous'}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">
                {replyingToComment.content}
              </p>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="text-xs text-muted-foreground hover:text-foreground font-medium flex-shrink-0 px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Author Info - Only show for password-protected shares (not for admin users) */}
      {!currentVideoRestricted && showAuthorInput && !isOtpAuthenticated && (
        <div className="mb-3 space-y-2">
          {namedRecipients.length > 0 ? (
            <>
              <Select
                value={nameSource === 'recipient' && selectedRecipientId ? selectedRecipientId : nameSource === 'custom' ? 'custom' : 'none'}
                onValueChange={(value) => {
                  if (value === 'custom') {
                    onNameSourceChange('custom')
                  } else if (value === 'none') {
                    onNameSourceChange('none')
                  } else {
                    onNameSourceChange('recipient', value)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a name..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a name...</SelectItem>
                  {namedRecipients.map((recipient) => (
                    <SelectItem key={recipient.id} value={recipient.id}>
                      {recipient.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom Name</SelectItem>
                </SelectContent>
              </Select>

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

      {/* Show read-only name indicator when OTP authenticated */}
      {!currentVideoRestricted && showAuthorInput && isOtpAuthenticated && authorName && (
        <div className="mb-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border border-border rounded-md">
            <InitialsAvatar name={authorName} size="sm" />
            <span className="text-sm text-foreground font-medium">
              Commenting as <span className="font-semibold">{authorName}</span>
            </span>
          </div>
        </div>
      )}

      {/* Timestamp indicator */}
      {timestampLabel && !currentVideoRestricted && (
        <div className="mb-3 flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-md bg-warning-visible px-2 py-1 text-sm font-semibold text-warning">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono">{timestampLabel}</span>
          </div>
          <Button
            type="button"
            onClick={onClearTimestamp}
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Clear timestamp"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Message Input */}
      {!currentVideoRestricted && (
        <>
          {/* Pending attachment chips */}
          {pendingAttachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {pendingAttachments.map((att) => (
                <span
                  key={att.assetId}
                  className="inline-flex items-center gap-1.5 px-2 py-1 bg-muted/40 border border-border/50 rounded-md text-xs text-foreground"
                >
                  <Paperclip className="w-3 h-3 text-muted-foreground" />
                  <span className="truncate max-w-[120px]">{att.fileName}</span>
                  {onRemoveAttachment && (
                    <button
                      type="button"
                      onClick={() => onRemoveAttachment(att.assetId)}
                      className="text-muted-foreground hover:text-foreground ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Textarea
              placeholder="Type your message..."
              value={newComment}
              onChange={(e) => onCommentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              className="resize-none"
              rows={2}
            />
            <div className="flex items-center justify-end gap-2 self-end sm:self-auto">
              {allowClientAssetUpload && selectedVideoIdProp && onAttachmentAdded && (
                <CommentAttachmentButton
                  videoId={selectedVideoIdProp}
                  shareToken={shareToken}
                  onAttachmentAdded={onAttachmentAdded}
                  onUploadError={onAttachmentErrorChange}
                  disabled={loading}
                  maxFiles={maxCommentAttachments}
                />
              )}
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
          </div>
          {(attachmentError || attachmentNotice) && (
            <p className={`mt-2 text-xs ${attachmentError ? 'text-destructive' : 'text-muted-foreground'}`}>
              {attachmentError || attachmentNotice}
            </p>
          )}

          {isNameRequired ? (
            <p className="text-xs text-warning mt-2">
              Please select your name from the dropdown above before sending
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Press Enter to send & Shift+Enter for new line
              </p>
              {showShortcutsButton && onShowShortcuts && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onShowShortcuts}
                  className="self-start sm:self-auto hidden lg:inline-flex"
                >
                  <Keyboard className="w-4 h-4 lg:mr-2" />
                  <span className="hidden lg:inline">Shortcuts</span>
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
