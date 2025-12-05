'use client'

import { useState, useEffect, useRef } from 'react'
import { Comment, Video } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { CheckCircle2, MessageSquare } from 'lucide-react'
import MessageBubble from './MessageBubble'
import CommentInput from './CommentInput'
import { useCommentManagement } from '@/hooks/useCommentManagement'
import { formatDate } from '@/lib/utils'
import { apiFetch } from '@/lib/api-client'

type CommentWithReplies = Comment & {
  replies?: Comment[]
}

interface CommentSectionProps {
  projectId: string
  projectSlug?: string
  comments: CommentWithReplies[]
  clientName: string
  clientEmail?: string
  isApproved: boolean
  restrictToLatestVersion?: boolean
  videos?: Video[]
  isAdminView?: boolean
  companyName?: string // Studio company name
  clientCompanyName?: string | null // Client company name
  smtpConfigured?: boolean
  isPasswordProtected?: boolean
  adminUser?: any
  recipients?: Array<{ id: string; name: string | null }>
  shareToken?: string | null
}

export default function CommentSection({
  projectId,
  projectSlug,
  comments: initialComments,
  clientName,
  clientEmail,
  isApproved,
  restrictToLatestVersion = false,
  videos = [],
  isAdminView = false,
  companyName = 'Studio',
  clientCompanyName = null,
  smtpConfigured = false,
  isPasswordProtected = false,
  adminUser = null,
  recipients = [],
  shareToken = null,
}: CommentSectionProps) {
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
    handleCommentChange,
    handleSubmitComment,
    handleReply,
    handleCancelReply,
    handleClearTimestamp,
    handleDeleteComment,
    setAuthorName,
    handleNameSourceChange,
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
    companyName,
  })

  // Auto-scroll to latest comment (like messaging apps)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [localComments, setLocalComments] = useState<CommentWithReplies[]>(initialComments)

  // Fetch comments function (only used for event-triggered updates)
  const fetchComments = async () => {
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
  }

  // Initialize localComments only (no polling - hook handles optimistic updates)
  useEffect(() => {
    setLocalComments(initialComments)
  }, [initialComments])

  // Listen for immediate comment updates (delete, approve, etc.)
  useEffect(() => {
    const handleCommentUpdate = () => {
      fetchComments()
    }

    window.addEventListener('commentDeleted', handleCommentUpdate)
    window.addEventListener('videoApprovalChanged', handleCommentUpdate)

    return () => {
      window.removeEventListener('commentDeleted', handleCommentUpdate)
      window.removeEventListener('videoApprovalChanged', handleCommentUpdate)
    }
  }, [projectId])

  // Get latest video version
  const latestVideoVersion = videos.length > 0
    ? Math.max(...videos.map(v => v.version))
    : null

  // Check if currently selected video is approved
  const currentVideo = videos.find(v => v.id === selectedVideoId)
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

  // Flatten ALL messages (parents + replies) and sort chronologically
  // This makes it feel like a real chat where replies appear at the bottom
  const flattenedMessages: Array<{ comment: CommentWithReplies; isReply: boolean }> = []

  displayComments.forEach(comment => {
    // Add parent comment
    flattenedMessages.push({ comment, isReply: false })

    // Add all replies
    if (comment.replies && comment.replies.length > 0) {
      comment.replies.forEach((reply: any) => {
        flattenedMessages.push({ comment: reply, isReply: true })
      })
    }
  })

  // Sort ALL messages chronologically (parents and replies mixed)
  flattenedMessages.sort((a, b) => {
    const timeA = new Date(a.comment.createdAt).getTime()
    const timeB = new Date(b.comment.createdAt).getTime()
    return timeA - timeB
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

  const handleScrollToComment = (commentId: string) => {
    const element = document.getElementById(`comment-${commentId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Brief highlight effect
      element.style.transition = 'background-color 0.3s'
      element.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'
      setTimeout(() => {
        element.style.backgroundColor = 'transparent'
      }, 1000)
    }
  }

  return (
    <Card className="bg-card border border-border flex flex-col h-auto lg:h-full max-h-[75vh] rounded-lg overflow-hidden" data-comment-section>
      <CardHeader className="border-b border-border flex-shrink-0">
        <CardTitle className="text-foreground flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Feedback & Discussion
        </CardTitle>
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

        {/* Messages Area - Chat Style */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-gray-50 dark:bg-gray-900/30">
          {flattenedMessages.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            <>
              {flattenedMessages.map(({ comment, isReply }) => {
                const parentComment = isReply && comment.parentId
                  ? mergedComments.find(c => c.id === comment.parentId)
                  : null

                // Viewer's own messages: admin sees their internal messages, client sees their non-internal messages
                const isViewerMessage = isAdminView ? comment.isInternal : !comment.isInternal

                return (
                  <MessageBubble
                    key={comment.id}
                    comment={comment}
                    isReply={isReply}
                    isStudio={comment.isInternal}
                    studioCompanyName={companyName}
                    clientCompanyName={clientCompanyName}
                    parentComment={parentComment}
                    onReply={!isReply ? () => handleReply(comment.id, comment.videoId) : undefined}
                    onSeekToTimestamp={handleSeekToTimestamp}
                    onDelete={isAdminView ? () => handleDeleteComment(comment.id) : undefined}
                    onScrollToComment={handleScrollToComment}
                    formatMessageTime={formatMessageTime}
                    commentsDisabled={commentsDisabled}
                    isViewerMessage={isViewerMessage}
                  />
                )
              })}
              {/* Invisible anchor for auto-scroll */}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <CommentInput
          newComment={newComment}
          onCommentChange={handleCommentChange}
          onSubmit={handleSubmitComment}
          loading={loading}
          selectedTimestamp={selectedTimestamp}
          onClearTimestamp={handleClearTimestamp}
          selectedVideoFps={selectedVideoFps}
          replyingToComment={replyingToComment}
          onCancelReply={handleCancelReply}
          showAuthorInput={!isAdminView && isPasswordProtected}
          authorName={authorName}
          onAuthorNameChange={setAuthorName}
          namedRecipients={namedRecipients}
          nameSource={nameSource}
          selectedRecipientId={selectedRecipientId}
          onNameSourceChange={handleNameSourceChange}
          currentVideoRestricted={currentVideoRestricted}
          restrictionMessage={restrictionMessage}
          commentsDisabled={commentsDisabled}
        />
      </CardContent>
    </Card>
  )
}
