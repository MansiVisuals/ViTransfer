'use client'

import { useState, useEffect, useRef } from 'react'
import { Comment, Video } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Input } from './ui/input'
import { formatTimestamp } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { CheckCircle2, MessageSquare, Clock, Send, User, Mail } from 'lucide-react'
import DOMPurify from 'dompurify'

// Extended Comment type to include replies
type CommentWithReplies = Comment & {
  replies?: Comment[]
}

/**
 * Sanitize HTML content for display
 * Defense in depth: Even though content is sanitized on backend,
 * we sanitize again on frontend for extra security
 */
function sanitizeContent(content: string): string {
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'target'],
    ALLOW_DATA_ATTR: false
  })
}

interface CommentSectionProps {
  projectId: string
  comments: CommentWithReplies[]
  clientName: string
  clientEmail?: string // Add client email
  isApproved: boolean // Keep for backward compatibility (project-level)
  restrictToLatestVersion?: boolean
  videos?: Video[]
  isAdminView?: boolean // Add flag to indicate if this is admin view (show reply functionality)
  companyName?: string // Company name from settings
  smtpConfigured?: boolean // Whether SMTP is configured
  isPasswordProtected?: boolean // Whether the project is password-protected
  adminUser?: any // Admin user object if viewing as admin on share page
}

export default function CommentSection({
  projectId,
  comments: initialComments,
  clientName,
  clientEmail,
  isApproved,
  restrictToLatestVersion = false,
  videos = [],
  isAdminView = false,
  companyName = 'Studio',
  smtpConfigured = false,
  isPasswordProtected = false, // Default to false for non-protected shares
  adminUser = null,
}: CommentSectionProps) {
  const router = useRouter()

  // Only store optimistic (temporary) comments in state
  const [optimisticComments, setOptimisticComments] = useState<CommentWithReplies[]>([])

  const [newComment, setNewComment] = useState('')

  // SECURITY: For non-password-protected shares, always show "Client" instead of real name
  const displayClientName = isPasswordProtected ? clientName : 'Client'
  const [authorName, setAuthorName] = useState(displayClientName || '')

  const [notifyByEmail, setNotifyByEmail] = useState(false)
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null)
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasAutoFilledTimestamp, setHasAutoFilledTimestamp] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Merge real comments from parent with optimistic comments
  // Filter out optimistic comments that now exist in initialComments (server confirmed them)
  const activeOptimisticComments = optimisticComments.filter(oc => {
    // Keep optimistic comment if no real comment matches it yet
    const hasRealVersion = initialComments.some(rc =>
      rc.content === oc.content &&
      Math.abs(new Date(rc.createdAt).getTime() - new Date(oc.createdAt).getTime()) < 5000 // Within 5 seconds
    )
    return !hasRealVersion
  })

  // Merge: real comments + only active optimistic comments
  const comments = [...initialComments, ...activeOptimisticComments]

  // Get latest video version if restriction is enabled
  const latestVideoVersion = videos.length > 0
    ? Math.max(...videos.map(v => v.version))
    : null

  // Check if currently selected video is approved (per-video approval)
  const currentVideo = videos.find(v => v.id === selectedVideoId)
  const isCurrentVideoApproved = currentVideo ? (currentVideo as any).approved === true : false

  // Determine if comments should be disabled (either project approved OR current video approved)
  const commentsDisabled = isApproved || isCurrentVideoApproved

  // Load notifyByEmail preference from cookies on mount
  useEffect(() => {
    const cookieName = `notifyByEmail_${projectId}`
    const cookies = document.cookie.split(';')
    const savedCookie = cookies.find(c => c.trim().startsWith(`${cookieName}=`))
    if (savedCookie) {
      const value = savedCookie.split('=')[1]
      setNotifyByEmail(value === 'true')
    }
  }, [projectId])

  // Save notifyByEmail preference to cookies when it changes (expires in 1 year)
  useEffect(() => {
    const cookieName = `notifyByEmail_${projectId}`
    const maxAge = 365 * 24 * 60 * 60 // 1 year in seconds
    if (notifyByEmail) {
      document.cookie = `${cookieName}=true; path=/; max-age=${maxAge}; SameSite=Lax`
    } else {
      // Remove cookie by setting max-age to 0
      document.cookie = `${cookieName}=false; path=/; max-age=0`
    }
  }, [notifyByEmail, projectId])

  // Auto-scroll to bottom when new comments arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [comments])

  // Sync current video ID on mount and when user switches videos
  useEffect(() => {
    // Get the current video ID from the video player
    const syncCurrentVideo = () => {
      window.dispatchEvent(
        new CustomEvent('getSelectedVideoId', {
          detail: {
            callback: (videoId: string) => {
              if (!selectedVideoId || selectedVideoId !== videoId) {
                setSelectedVideoId(videoId)
              }
            },
          },
        })
      )
    }

    // Sync immediately on mount
    syncCurrentVideo()

    // Also sync when videos array changes (new video uploaded)
    const interval = setInterval(syncCurrentVideo, 1000)

    return () => clearInterval(interval)
  }, [videos, selectedVideoId])

  // Listen for add comment events from video player
  useEffect(() => {
    const handleAddComment = (e: CustomEvent) => {
      setSelectedVideoId(e.detail.videoId)
      setSelectedTimestamp(e.detail.timestamp)
      setHasAutoFilledTimestamp(true)
    }

    window.addEventListener('addComment', handleAddComment as EventListener)
    return () => {
      window.removeEventListener('addComment', handleAddComment as EventListener)
    }
  }, [])

  // Auto-fill timestamp when user starts typing in feedback field
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setNewComment(value)

    // If user is typing and we haven't auto-filled the timestamp yet
    if (value.length > 0 && !hasAutoFilledTimestamp && selectedTimestamp === null) {
      // Request current time from video player
      window.dispatchEvent(
        new CustomEvent('getCurrentTime', {
          detail: {
            callback: (time: number, videoId: string) => {
              setSelectedTimestamp(time)
              setSelectedVideoId(videoId)
              setHasAutoFilledTimestamp(true)
            },
          },
        })
      )
    }
  }

  async function handleSubmitComment() {
    if (!newComment.trim()) return

    // Check if commenting on latest version only
    if (restrictToLatestVersion && selectedVideoId) {
      const selectedVideo = videos.find(v => v.id === selectedVideoId)
      if (selectedVideo && selectedVideo.version !== latestVideoVersion) {
        alert('Comments are only allowed on the latest version of this project.')
        return
      }
    }

    setLoading(true)

    // OPTIMISTIC UPDATE: Add comment to UI immediately (like texting)
    const isInternalComment = !!adminUser
    const optimisticComment: CommentWithReplies = {
      id: `temp-${Date.now()}`, // Temporary ID
      projectId,
      videoId: selectedVideoId,
      videoVersion: selectedVideoId ? videos.find(v => v.id === selectedVideoId)?.version || null : null,
      timestamp: selectedTimestamp,
      content: newComment,
      authorName: isInternalComment
        ? (adminUser.name || adminUser.email)
        : (isPasswordProtected ? authorName : 'Client'),
      authorEmail: isInternalComment ? adminUser.email : (clientEmail || null),
      isInternal: isInternalComment,
      createdAt: new Date(),
      updatedAt: new Date(),
      parentId: null,
      userId: null,
      notifyByEmail: false,
      notificationEmail: null,
      replies: [],
    }

    // Add optimistic comment immediately
    setOptimisticComments(prev => [...prev, optimisticComment])

    // Clear form immediately for instant feedback
    const commentContent = newComment
    const commentTimestamp = selectedTimestamp
    const commentVideoId = selectedVideoId
    setNewComment('')
    setSelectedTimestamp(null)
    setSelectedVideoId(null)
    setHasAutoFilledTimestamp(false)

    try {
      // Only enable email notifications if clientEmail exists
      const shouldNotify = !!(notifyByEmail && clientEmail)

      // If admin user is present, send as internal comment
      const isInternalComment = !!adminUser

      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          videoId: commentVideoId,
          timestamp: commentTimestamp,
          content: commentContent,
          authorName: isInternalComment ? (adminUser.name || adminUser.email) : (authorName || null),
          authorEmail: isInternalComment ? adminUser.email : (clientEmail || null),
          notifyByEmail: shouldNotify && !isInternalComment, // Admins don't get email notifications for their own comments
          notificationEmail: shouldNotify && !isInternalComment ? clientEmail : null,
          isInternal: isInternalComment,
        }),
      })

      if (!response.ok) throw new Error('Failed to submit comment')

      // Refresh to get the real comment from server
      // The optimistic comment will auto-disappear when the real one appears (see merge logic above)
      router.refresh()
    } catch (error) {
      // Remove optimistic comment on error
      setOptimisticComments(prev => prev.filter(c => c.id !== optimisticComment.id))
      // Restore form values on error
      setNewComment(commentContent)
      setSelectedTimestamp(commentTimestamp)
      setSelectedVideoId(commentVideoId)
      alert('Failed to submit comment')
    } finally {
      setLoading(false)
    }
  }

  // Check if currently selected video is allowed for commenting
  const isCurrentVideoAllowed = () => {
    if (!restrictToLatestVersion) {
      return true
    }
    if (!selectedVideoId) {
      return true
    }
    const selectedVideo = videos.find(v => v.id === selectedVideoId)
    if (!selectedVideo) {
      return true
    }
    const isLatest = selectedVideo.version === latestVideoVersion
    return isLatest
  }

  const currentVideoRestricted = restrictToLatestVersion && selectedVideoId && !isCurrentVideoAllowed()

  // Edit comment
  const handleEditComment = async (commentId: string) => {
    if (!editContent.trim()) return

    setLoading(true)
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      })

      if (!response.ok) throw new Error('Failed to update comment')

      // Don't need to set state - parent will refresh
      setEditingCommentId(null)
      setEditContent('')
      router.refresh()
    } catch (error) {
      alert('Failed to update comment')
    } finally {
      setLoading(false)
    }
  }

  // Delete comment
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Are you sure you want to delete this message? This action cannot be undone.')) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete comment')

      // Don't need to set state - parent will refresh
      router.refresh()
    } catch (error) {
      alert('Failed to delete comment')
    } finally {
      setLoading(false)
    }
  }

  // Start editing
  const startEditing = (commentId: string, currentContent: string) => {
    setEditingCommentId(commentId)
    setEditContent(currentContent)
  }

  // Cancel editing
  const cancelEditing = () => {
    setEditingCommentId(null)
    setEditContent('')
  }

  // Filter comments based on currently selected video
  // If a video is selected, show comments for that specific video + general comments (no videoId)
  // If restrictToLatestVersion is enabled, only show comments for the latest version in overview
  const displayComments = selectedVideoId
    ? comments.filter(comment => {
        // Show general comments (no specific video)
        if (!comment.videoId) return true

        // Show ONLY comments for currently selected video
        if (comment.videoId === selectedVideoId) return true

        // Don't show comments from other videos
        return false
      })
    : (restrictToLatestVersion && latestVideoVersion
        ? comments.filter(comment =>
            !comment.videoVersion || comment.videoVersion === latestVideoVersion
          )
        : comments)

  // Flatten comments with their replies for chat-style display
  const flattenedMessages: Array<{ comment: CommentWithReplies; isReply: boolean }> = []
  displayComments.forEach(comment => {
    flattenedMessages.push({ comment, isReply: false })
    if (comment.replies && comment.replies.length > 0) {
      comment.replies.forEach((reply: any) => {
        flattenedMessages.push({ comment: reply, isReply: true })
      })
    }
  })

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
    return new Date(date).toLocaleDateString()
  }

  return (
    <Card className="bg-card border-border flex flex-col max-h-[600px] sm:max-h-[700px] lg:max-h-[800px]">
      <CardHeader className="border-b border-border flex-shrink-0">
        <CardTitle className="text-foreground flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Feedback & Discussion
        </CardTitle>
        {selectedVideoId && (() => {
          const currentVideo = videos.find(v => v.id === selectedVideoId)
          if (currentVideo) {
            if (commentsDisabled) {
              return (
                <p className="text-xs text-success mt-1">
                  Watching approved version
                </p>
              )
            } else {
              return (
                <p className="text-xs text-muted-foreground mt-1">
                  Currently viewing: {currentVideo.versionLabel}
                </p>
              )
            }
          }
          return null
        })()}
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden min-h-0">
        {/* Approval Status Banner - Display Only */}
        {commentsDisabled && (
          <div className="bg-success-visible border-b-2 border-success-visible p-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-success flex-shrink-0" />
              <div>
                <h3 className="text-foreground font-medium">{isCurrentVideoApproved ? 'Video Approved' : 'Project Approved'}</h3>
                <p className="text-sm text-muted-foreground">
                  {isCurrentVideoApproved
                    ? 'This video has been approved and is ready for download.'
                    : 'The final version is ready for download without watermarks.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Messages Area - Chat Style */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {flattenedMessages.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            <>
              {flattenedMessages.map(({ comment, isReply }) => {
                const isStudio = comment.isInternal
                const alignment = isStudio ? 'justify-end' : 'justify-start'
                const bgColor = isStudio ? 'bg-primary' : 'bg-secondary'
                const textAlign = isStudio ? 'text-right' : 'text-left'
                const isEditing = editingCommentId === comment.id

                return (
                  <div key={comment.id} className={`flex ${alignment} ${isReply ? 'ml-4 sm:ml-8' : ''}`}>
                    <div className={`max-w-[90%] sm:max-w-[80%] md:max-w-[75%] ${textAlign}`}>
                      {/* Message Bubble */}
                      <div className={`${bgColor} rounded-2xl px-4 py-2 inline-block`}>
                        {/* Author & Timestamp Header */}
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span className="text-xs font-medium">
                              {comment.authorName || 'Anonymous'}
                            </span>
                          </div>
                          {isStudio && (
                            <span className="text-xs bg-primary-foreground/20 px-2 py-0.5 rounded-full">
                              {companyName}
                            </span>
                          )}
                          {comment.videoVersion && (
                            <span className="text-xs">
                              v{comment.videoVersion}
                            </span>
                          )}
                        </div>

                        {/* Timestamp Badge (if present) */}
                        {comment.timestamp !== null && comment.timestamp !== undefined && (
                          <button
                            onClick={() => {
                              // Dispatch custom event for video seeking
                              window.dispatchEvent(new CustomEvent('seekToTime', {
                                detail: {
                                  timestamp: comment.timestamp,
                                  videoId: comment.videoId,
                                  videoVersion: comment.videoVersion
                                }
                              }))
                            }}
                            className="flex items-center gap-1 mb-1 cursor-pointer hover:opacity-80 transition-opacity"
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
                          className="text-sm whitespace-pre-wrap break-words"
                          dangerouslySetInnerHTML={{ __html: sanitizeContent(comment.content) }}
                        />
                      </div>

                      {/* Message Time */}
                      <p className="text-xs text-muted-foreground mt-1 px-2">
                        {formatMessageTime(comment.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area - Bottom Fixed */}
        {!commentsDisabled && (
          <div className="border-t border-border p-4 bg-card flex-shrink-0">
            {/* Restriction Warning */}
            {currentVideoRestricted && (
              <div className="mb-3 p-3 bg-warning-visible border-2 border-warning-visible rounded-lg">
                <p className="text-sm text-warning font-medium flex items-center gap-2">
                  <span className="font-semibold">Comments Restricted</span>
                </p>
                <p className="text-xs text-warning font-medium mt-1">
                  You can only leave feedback on the latest version. Please switch to version {latestVideoVersion} to comment.
                </p>
              </div>
            )}

            {/* Author Info - Only show for password-protected shares (not for admin users) */}
            {!currentVideoRestricted && isPasswordProtected && !adminUser && (
              <div className="mb-3 space-y-2">
                <Input
                  placeholder="Your name (optional)"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="text-sm"
                />
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
                  onClick={() => {
                    setSelectedTimestamp(null)
                    setSelectedVideoId(null)
                    setHasAutoFilledTimestamp(false)
                  }}
                  variant="ghost"
                  size="xs"
                  className="text-muted-foreground"
                >
                  Clear
                </Button>
              </div>
            )}

            {/* Email notification opt-in - only show if SMTP is configured and NOT in admin view (client view only) */}
            {!currentVideoRestricted && clientEmail && smtpConfigured && !isAdminView && (
              <div className="mb-3">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyByEmail}
                    onChange={(e) => setNotifyByEmail(e.target.checked)}
                    className="rounded border-border bg-background text-primary focus:ring-primary"
                  />
                  <Mail className="w-4 h-4" />
                  Notify me by email when there's a reply
                </label>
              </div>
            )}

            {/* Message Input */}
            {!currentVideoRestricted && (
              <>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Type your message..."
                    value={newComment}
                    onChange={handleCommentChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSubmitComment()
                      }
                    }}
                    className="resize-none"
                    rows={2}
                  />
                  <Button
                    onClick={handleSubmitComment}
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
        )}
      </CardContent>
    </Card>
  )
}
