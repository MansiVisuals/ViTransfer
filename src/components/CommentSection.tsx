'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Comment, Video } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { CheckCircle2, MessageSquare, ChevronDown, ChevronUp, PanelRightClose } from 'lucide-react'
import { cn } from '@/lib/utils'
import MessageBubble from './MessageBubble'
import CommentInput from './CommentInput'
import { useCommentManagement } from '@/hooks/useCommentManagement'
import { formatDate } from '@/lib/utils'
import { apiFetch } from '@/lib/api-client'
import { formatCommentTimestamp, timecodeToSeconds } from '@/lib/timecode'

type CommentWithReplies = Comment & {
  replies?: Comment[]
}

interface CommentSectionProps {
  projectId: string
  projectSlug?: string
  comments: CommentWithReplies[]
  focusCommentId?: string | null
  clientName: string
  clientEmail?: string
  isApproved: boolean
  restrictToLatestVersion?: boolean
  videos?: Video[]
  isAdminView?: boolean
  smtpConfigured?: boolean
  isPasswordProtected?: boolean
  adminUser?: any
  recipients?: Array<{ id: string; name: string | null; email: string | null }>
  shareToken?: string | null
  showShortcutsButton?: boolean
  timestampDisplayMode?: 'TIMECODE' | 'AUTO'
  mobileCollapsible?: boolean
  initialMobileCollapsed?: boolean
  authenticatedEmail?: string | null
  allowClientAssetUpload?: boolean
  onToggleVisibility?: () => void
  showToggleButton?: boolean
  onMobileExpandedChange?: (expanded: boolean) => void
}

export default function CommentSection({
  projectId,
  projectSlug: _projectSlug,
  comments: initialComments,
  focusCommentId = null,
  clientName,
  clientEmail,
  isApproved,
  restrictToLatestVersion = false,
  videos = [],
  isAdminView = false,
  smtpConfigured: _smtpConfigured = false,
  isPasswordProtected = false,
  adminUser = null,
  recipients = [],
  shareToken = null,
  showShortcutsButton = false,
  timestampDisplayMode = 'TIMECODE',
  mobileCollapsible = false,
  initialMobileCollapsed = true,
  authenticatedEmail = null,
  allowClientAssetUpload = false,
  onToggleVisibility,
  showToggleButton = false,
  onMobileExpandedChange,
}: CommentSectionProps) {
  const [isMobileCollapsed, setIsMobileCollapsed] = useState(initialMobileCollapsed)
  const {
    comments,
    newComment,
    selectedTimestamp,
    selectedVideoId,
    selectedVideoFps,
    loading,
    replyingToCommentId,
    authorName,
    nameSource,
    selectedRecipientId,
    namedRecipients,
    isOtpAuthenticated,
    pendingAttachments,
    attachmentError,
    attachmentNotice,
    handleCommentChange,
    handleSubmitComment,
    handleReply,
    handleCancelReply,
    handleClearTimestamp,
    handleDeleteComment,
    setAuthorName,
    handleNameSourceChange,
    handleAttachmentAdded,
    handleRemoveAttachment,
    handleAttachmentErrorChange,
  } = useCommentManagement({
    projectId,
    initialComments,
    videos,
    clientEmail,
    isPasswordProtected,
    adminUser,
    recipients,
    clientName,
    restrictToLatestVersion,
    shareToken,
    useAdminAuth: isAdminView,
    authenticatedEmail,
  })

  // Auto-scroll to latest comment (like messaging apps)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [localComments, setLocalComments] = useState<CommentWithReplies[]>(initialComments)

  // Fetch comments function (only used for event-triggered updates)
  const fetchComments = useCallback(async () => {
    try {
      const response = isAdminView
        ? await apiFetch(`/api/comments?projectId=${projectId}`)
        : shareToken
          ? await fetch(`/api/comments?projectId=${projectId}`, {
              headers: { Authorization: `Bearer ${shareToken}` },
            })
          : null

      if (!response) return

      if (response.ok) {
        const freshComments = await response.json()
        setLocalComments(freshComments)
      }
    } catch (error) {
      // Silent fail - keep showing existing comments
    }
  }, [isAdminView, projectId, shareToken])

  // Initialize localComments only (no polling - hook handles optimistic updates)
  useEffect(() => {
    setLocalComments(initialComments)
  }, [initialComments])

  const lastFocusedCommentRef = useRef<string | null>(null)
  useEffect(() => {
    if (!focusCommentId) return
    if (lastFocusedCommentRef.current === focusCommentId) return

    lastFocusedCommentRef.current = focusCommentId

    let attempts = 0
    const maxAttempts = 6

    const tryScroll = () => {
      attempts += 1
      const element = document.getElementById(`comment-${focusCommentId}`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        element.style.transition = 'background-color 0.3s'
        element.style.backgroundColor = 'hsl(var(--primary) / 0.12)'
        setTimeout(() => {
          element.style.backgroundColor = 'transparent'
        }, 1000)
        return
      }

      if (attempts < maxAttempts) {
        setTimeout(tryScroll, 200)
      }
    }

    setTimeout(tryScroll, 100)
  }, [focusCommentId, localComments.length])

  // Listen for immediate comment updates (delete, approve, post, etc.)
  useEffect(() => {
    const handleCommentPosted = (e: CustomEvent) => {
      // Use the comments data from the event if available, otherwise refetch
      if (e.detail?.comments) {
        setLocalComments(e.detail.comments)
      } else {
        fetchComments()
      }
    }

    const handleCommentUpdate = () => {
      fetchComments()
    }

    window.addEventListener('commentDeleted', handleCommentUpdate)
    window.addEventListener('commentPosted', handleCommentPosted as EventListener)
    window.addEventListener('videoApprovalChanged', handleCommentUpdate)

    return () => {
      window.removeEventListener('commentDeleted', handleCommentUpdate)
      window.removeEventListener('commentPosted', handleCommentPosted as EventListener)
      window.removeEventListener('videoApprovalChanged', handleCommentUpdate)
    }
  }, [projectId, fetchComments])

  // Get latest video version
  const latestVideoVersion = videos.length > 0
    ? Math.max(...videos.map(v => v.version))
    : null

  // Check if currently selected video is approved
  const currentVideo = videos.find(v => v.id === selectedVideoId)
  const currentVideoDuration = currentVideo?.duration ?? null
  const isCurrentVideoApproved = currentVideo ? (currentVideo as any).approved === true : false
  // Check if ANY video in the group is approved (for admin view with multiple versions)
  const hasAnyApprovedVideo = videos.some(v => (v as any).approved === true)
  const approvedVideo = videos.find(v => (v as any).approved === true)
  const commentsDisabled = isApproved || isCurrentVideoApproved || hasAnyApprovedVideo

  // Always use hook comments (includes optimistic updates)
  // Local comments only used as fallback if hook hasn't loaded
  const mergedComments = comments.length > 0 ? comments : localComments

  // Filter comments based on currently selected video
  const displayComments = (() => {
    if (!selectedVideoId) {
      // No video selected - show all or latest version only
      return restrictToLatestVersion && latestVideoVersion
        ? mergedComments.filter(comment => comment.videoVersion === latestVideoVersion)
        : mergedComments
    }

    // Both admin and share page: show comments for specific videoId only
    return mergedComments.filter(comment => comment.videoId === selectedVideoId)
  })()

  // Sort top-level comments chronologically
  const sortedComments = [...displayComments].sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  // Sort replies under each parent chronologically
  sortedComments.forEach(comment => {
    if (comment.replies && comment.replies.length > 0) {
      comment.replies.sort((a: Comment, b: Comment) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })
    }
  })

  // Auto-scroll to bottom when new comments appear
  // Scrolls only the messages container, not the entire page
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [displayComments.length])

  // Check if commenting on current video is allowed
  const isCurrentVideoAllowed = () => {
    if (!restrictToLatestVersion) return true
    if (!selectedVideoId) return true
    const selectedVideo = videos.find(v => v.id === selectedVideoId)
    if (!selectedVideo) return true
    return selectedVideo.version === latestVideoVersion
  }

  const currentVideoRestricted = Boolean(restrictToLatestVersion && selectedVideoId && !isCurrentVideoAllowed())
  const restrictionMessage = currentVideoRestricted
    ? `You can only leave feedback on the latest version. Please switch to version ${latestVideoVersion} to comment.`
    : undefined

  const replyingToComment = mergedComments.find(c => c.id === replyingToCommentId) || null

  // Format message time
  const formatMessageTime = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - new Date(date).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return formatDate(date)
  }

  const handleSeekToTimestamp = (timestamp: number, videoId: string, videoVersion: number | null) => {
    // Check if we're on a page with a video player by checking if the event listener exists
    const hasVideoPlayer = typeof window !== 'undefined' && document.querySelector('video')

    if (hasVideoPlayer) {
      // If video player is present (admin share page or public share page), dispatch event
      window.dispatchEvent(new CustomEvent('seekToTime', {
        detail: { timestamp, videoId, videoVersion }
      }))
    } else if (isAdminView) {
      // If in admin view without video player, navigate to admin share page with timestamp
      const video = videos.find(v => v.id === videoId)
      if (!video) return

      // Navigate to admin share page with video, version, and timestamp parameters
      const adminShareUrl = `/admin/projects/${projectId}/share?video=${encodeURIComponent(video.name)}&version=${videoVersion || video.version}&t=${Math.floor(timestamp)}`
      window.location.href = adminShareUrl
    }
  }

  const handleSeekToTimecode = (timecode: string, videoId: string, videoVersion: number | null) => {
    const fps = videos.find(v => v.id === videoId)?.fps || 24
    const seconds = timecodeToSeconds(timecode, fps)
    handleSeekToTimestamp(seconds, videoId, videoVersion)
  }

  const handleOpenShortcuts = () => {
    window.dispatchEvent(new CustomEvent('openShortcutsDialog'))
  }

  return (
    <Card className="bg-card border-0 flex flex-col h-full lg:max-h-full rounded-none lg:rounded-lg overflow-hidden" data-comment-section>
      {/* Desktop: Show header at top, Mobile: Hide header (will show below input) */}
      <CardHeader className={cn("flex-shrink-0", mobileCollapsible && "hidden lg:block")}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-foreground flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Feedback & Discussion
          </CardTitle>
          {showToggleButton && onToggleVisibility && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleVisibility}
              className="hidden lg:flex h-8 px-2"
              title="Hide feedback section"
            >
              <PanelRightClose className="w-4 h-4" />
            </Button>
          )}
        </div>
        {selectedVideoId && currentVideo && !isAdminView && (
          <p className="text-xs text-muted-foreground mt-1">
            {commentsDisabled
              ? 'Watching approved version'
              : `Currently viewing: ${currentVideo.versionLabel}`}
          </p>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden min-h-0">
        {/* Approval Status Banner */}
        {commentsDisabled && (
          <div className="bg-success-visible border-b-2 border-success-visible p-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-success flex-shrink-0" />
              <div>
                <h3 className="text-foreground font-medium">
                  {isApproved ? 'Project Approved' : 'Video Approved'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isApproved
                    ? 'The final version is ready for download without watermarks.'
                    : approvedVideo
                    ? `${approvedVideo.versionLabel} of this video has been approved and is ready for download.`
                    : 'A version of this video has been approved and is ready for download.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Comment Input - MOVED TO TOP on mobile when collapsible */}
        {mobileCollapsible && (
          <div className="order-1 lg:hidden">
            <CommentInput
              newComment={newComment}
              onCommentChange={handleCommentChange}
              onSubmit={handleSubmitComment}
              loading={loading}
              selectedTimestamp={selectedTimestamp}
              onClearTimestamp={handleClearTimestamp}
              selectedVideoFps={selectedVideoFps}
              selectedVideoDurationSeconds={currentVideoDuration}
              timestampDisplayMode={timestampDisplayMode}
              replyingToComment={replyingToComment}
              onCancelReply={handleCancelReply}
              showAuthorInput={!isAdminView && isPasswordProtected}
              authorName={authorName}
              onAuthorNameChange={setAuthorName}
              namedRecipients={namedRecipients}
              nameSource={nameSource}
              selectedRecipientId={selectedRecipientId}
              onNameSourceChange={handleNameSourceChange}
              isOtpAuthenticated={isOtpAuthenticated}
              currentVideoRestricted={currentVideoRestricted}
              restrictionMessage={restrictionMessage}
              commentsDisabled={commentsDisabled}
              allowClientAssetUpload={allowClientAssetUpload}
              selectedVideoId={selectedVideoId}
              pendingAttachments={pendingAttachments}
              onAttachmentAdded={handleAttachmentAdded}
              onRemoveAttachment={handleRemoveAttachment}
              attachmentError={attachmentError}
              attachmentNotice={attachmentNotice}
              onAttachmentErrorChange={handleAttachmentErrorChange}
              shareToken={shareToken}
              showShortcutsButton={showShortcutsButton}
              onShowShortcuts={handleOpenShortcuts}
            />
          </div>
        )}

        {/* Collapsible header for messages (mobile only) - NOW includes "Feedback & Discussion" title */}
        {mobileCollapsible && (
          <button
            onClick={() => {
              const newCollapsed = !isMobileCollapsed
              setIsMobileCollapsed(newCollapsed)
              onMobileExpandedChange?.(!newCollapsed)
            }}
            className="order-2 lg:hidden w-full p-3 flex items-center justify-between bg-muted/30"
          >
            <span className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Feedback & Discussion ({sortedComments.length})
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {sortedComments.length > 0 ? formatMessageTime(sortedComments[sortedComments.length - 1].createdAt) : ''}
              </span>
              {isMobileCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </div>
          </button>
        )}

        {/* Messages Area - Threaded Conversations */}
        <div
          ref={messagesContainerRef}
          className={cn(
            "flex-1 overflow-y-auto p-4 space-y-6 min-h-0 bg-muted/20",
            mobileCollapsible && "order-3 lg:order-1",
            mobileCollapsible && isMobileCollapsed && "hidden lg:block"
          )}
        >
          {sortedComments.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            <>
              {sortedComments.map((comment, index) => {
                const sequenceNumber = index + 1
                const replies = comment.replies || []
                const video = videos.find(v => v.id === comment.videoId)
                const fps = video?.fps || 24
                const duration = video?.duration
                const showTimestamp =
                  typeof comment.timecode === 'string' &&
                  comment.timecode.trim() !== ''
                const timestampLabel = showTimestamp
                  ? formatCommentTimestamp({
                      timecode: comment.timecode,
                      fps,
                      videoDurationSeconds: duration,
                      mode: timestampDisplayMode,
                    })
                  : null

                return (
                  <div key={comment.id}>
                    <MessageBubble
                      comment={comment}
                      isReply={false}
                      onReply={() => handleReply(comment.id, comment.videoId)}
                      onSeekToTimecode={handleSeekToTimecode}
                      onDelete={isAdminView ? () => handleDeleteComment(comment.id) : undefined}
                      formatMessageTime={formatMessageTime}
                      commentsDisabled={commentsDisabled}
                      sequenceNumber={sequenceNumber}
                      replies={replies}
                      onDeleteReply={isAdminView ? handleDeleteComment : undefined}
                      timestampLabel={timestampLabel}
                      shareToken={shareToken}
                    />
                  </div>
                )
              })}
              {/* Invisible anchor for auto-scroll */}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area - Desktop and non-collapsible mobile */}
        <div className={cn(mobileCollapsible && "hidden lg:block lg:order-2")}>
          <CommentInput
          newComment={newComment}
          onCommentChange={handleCommentChange}
          onSubmit={handleSubmitComment}
          loading={loading}
          selectedTimestamp={selectedTimestamp}
          onClearTimestamp={handleClearTimestamp}
          selectedVideoFps={selectedVideoFps}
          selectedVideoDurationSeconds={currentVideoDuration}
          timestampDisplayMode={timestampDisplayMode}
          replyingToComment={replyingToComment}
          onCancelReply={handleCancelReply}
          showAuthorInput={!isAdminView && isPasswordProtected}
          authorName={authorName}
          onAuthorNameChange={setAuthorName}
          namedRecipients={namedRecipients}
          nameSource={nameSource}
          selectedRecipientId={selectedRecipientId}
          onNameSourceChange={handleNameSourceChange}
          isOtpAuthenticated={isOtpAuthenticated}
          currentVideoRestricted={currentVideoRestricted}
          restrictionMessage={restrictionMessage}
          commentsDisabled={commentsDisabled}
          allowClientAssetUpload={allowClientAssetUpload}
          selectedVideoId={selectedVideoId}
          pendingAttachments={pendingAttachments}
          onAttachmentAdded={handleAttachmentAdded}
          onRemoveAttachment={handleRemoveAttachment}
          attachmentError={attachmentError}
          attachmentNotice={attachmentNotice}
          onAttachmentErrorChange={handleAttachmentErrorChange}
          shareToken={shareToken}
          showShortcutsButton={showShortcutsButton}
          onShowShortcuts={handleOpenShortcuts}
        />
        </div>
      </CardContent>
    </Card>
  )
}
