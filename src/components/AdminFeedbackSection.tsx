'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Send, Reply, ExternalLink } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { useRouter } from 'next/navigation'
import { formatTimestamp } from '@/lib/utils'

interface Video {
  id: string
  version: number
  versionLabel: string
  status: string
}

interface Comment {
  id: string
  content: string
  authorName: string | null
  isInternal: boolean
  timestamp: number | null
  videoVersion: number | null
  createdAt: string | Date
  userId: string | null
  user: {
    id: string
    name: string | null
    username: string | null
    email: string
  } | null
  replies?: Comment[]
}

interface AdminFeedbackSectionProps {
  projectId: string
  initialComments: Comment[]
  videos: Video[]
  restrictToLatestVersion: boolean
  companyName: string
  onRefresh?: () => void
  projectSlug?: string // Share slug for building timestamp URLs
  activeVideoName?: string // Current video name for building URLs
}

export default function AdminFeedbackSection({
  projectId,
  initialComments,
  videos,
  restrictToLatestVersion,
  companyName,
  onRefresh,
  projectSlug,
  activeVideoName,
}: AdminFeedbackSectionProps) {
  const { user } = useAuth()
  const router = useRouter()

  // Build share URL for timestamp link
  const buildTimestampUrl = (timestamp: number, videoVersion: number | null) => {
    if (!projectSlug || !activeVideoName) return null

    const params = new URLSearchParams()
    params.set('video', activeVideoName)
    if (videoVersion !== null) {
      params.set('version', videoVersion.toString())
    }
    params.set('t', timestamp.toString())

    return `/share/${projectSlug}?${params.toString()}`
  }

  // Only store optimistic replies in state (like client side)
  const [optimisticReplies, setOptimisticReplies] = useState<Map<string, Comment[]>>(new Map())

  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedVersions, setExpandedVersions] = useState<Set<number>>(new Set())
  const replyInputRef = useRef<HTMLTextAreaElement>(null)
  const editInputRef = useRef<HTMLTextAreaElement>(null)

  // Merge real comments from parent with optimistic replies
  const comments = initialComments.map(comment => {
    const optimisticRepliesForComment = optimisticReplies.get(comment.id) || []

    if (optimisticRepliesForComment.length === 0) {
      return comment
    }

    // Filter out optimistic replies that now exist in real replies
    const activeOptimisticReplies = optimisticRepliesForComment.filter(or => {
      const hasRealVersion = comment.replies?.some(rr =>
        rr.content === or.content &&
        Math.abs(new Date(rr.createdAt).getTime() - new Date(or.createdAt).getTime()) < 5000
      )
      return !hasRealVersion
    })

    return {
      ...comment,
      replies: [...(comment.replies || []), ...activeOptimisticReplies]
    }
  })

  // Get latest video version
  const latestVideoVersion = videos.length > 0
    ? Math.max(...videos.map(v => v.version))
    : null

  // Auto-expand latest version when videos change
  useEffect(() => {
    if (latestVideoVersion !== null) {
      setExpandedVersions(new Set([latestVideoVersion]))
    }
    // Reset state when switching videos
    setOptimisticReplies(new Map())
    setReplyingTo(null)
    setReplyContent('')
    setEditingCommentId(null)
    setEditContent('')
  }, [videos])

  // Toggle version expansion
  const toggleVersion = (version: number) => {
    setExpandedVersions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(version)) {
        newSet.delete(version)
      } else {
        newSet.add(version)
      }
      return newSet
    })
  }

  // Focus reply input when opening reply box
  useEffect(() => {
    if (replyingTo && replyInputRef.current) {
      replyInputRef.current.focus()
    }
  }, [replyingTo])

  // Focus edit input when opening edit box
  useEffect(() => {
    if (editingCommentId && editInputRef.current) {
      editInputRef.current.focus()
    }
  }, [editingCommentId])

  const handleReply = async (parentCommentId: string) => {
    if (!replyContent.trim()) return

    setLoading(true)

    // OPTIMISTIC UPDATE: Add reply to UI immediately (like texting)
    const optimisticReply: Comment = {
      id: `temp-${Date.now()}`,
      content: replyContent,
      authorName: user?.name || user?.email || 'Admin',
      isInternal: true,
      timestamp: null,
      videoVersion: null,
      createdAt: new Date(),
      userId: user?.id || null,
      user: user ? {
        id: user.id,
        name: user.name,
        username: null,
        email: user.email
      } : null,
    }

    // Add to optimistic replies map
    setOptimisticReplies(prev => {
      const newMap = new Map(prev)
      const existing = newMap.get(parentCommentId) || []
      newMap.set(parentCommentId, [...existing, optimisticReply])
      return newMap
    })

    // Clear form immediately
    setReplyContent('')
    setReplyingTo(null)

    try {
      await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          content: replyContent,
          parentId: parentCommentId,
          isInternal: true,
          authorName: user?.name || user?.email || 'Admin',
        }),
      })

      // Don't manually remove optimistic reply - let merge logic handle it when parent refreshes
    } catch (error) {
      // Remove optimistic reply on error
      setOptimisticReplies(prev => {
        const newMap = new Map(prev)
        const existing = newMap.get(parentCommentId) || []
        newMap.set(parentCommentId, existing.filter(r => r.id !== optimisticReply.id))
        return newMap
      })
      alert('Failed to send reply')
    } finally {
      setLoading(false)
    }
  }

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

      // Refresh to show updated comments
      if (onRefresh) {
        onRefresh()
      } else {
        router.refresh()
      }
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

  // Check if a comment version is allowed (when restrictToLatestVersion is enabled)
  const isVersionAllowed = (videoVersion: number | null) => {
    if (!restrictToLatestVersion) return true
    if (videoVersion === null) return true // General comments always allowed
    return videoVersion === latestVideoVersion
  }

  // Group comments by version
  const commentsByVersion = videos.map(video => ({
    video,
    comments: comments.filter(c => c.videoVersion === video.version),
  }))

  const generalComments = comments.filter(c => c.videoVersion === null)

  return (
    <Card>
      <CardHeader className="flex-shrink-0">
        <CardTitle>Feedback</CardTitle>
        {restrictToLatestVersion && latestVideoVersion && (
          <p className="text-xs text-muted-foreground mt-1">
            Comments restricted to latest version only (v{latestVideoVersion})
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6">No feedback yet</p>
        ) : (
          <div className="p-6 space-y-0">
            {/* Version-specific comments - Each section has its own scroll */}
            {commentsByVersion.map(({ video, comments: videoComments }, index) => {
              if (videoComments.length === 0) return null

              const isAllowed = isVersionAllowed(video.version)
              const isExpanded = expandedVersions.has(video.version)
              const isLatest = video.version === latestVideoVersion

              return (
                <div key={video.id} className="border-b border-border last:border-b-0">
                  {/* Version Header - Clickable to expand/collapse */}
                  <div
                    className="py-3 cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => toggleVersion(video.version)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* Expand/Collapse Indicator */}
                        <svg 
                          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        
                        <span className={`text-sm font-semibold px-3 py-1.5 rounded-md ${
                          isLatest
                            ? 'bg-success-visible text-success border-2 border-success-visible'
                            : isAllowed
                            ? 'bg-primary-visible text-primary border-2 border-primary-visible'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {video.versionLabel}
                          {isLatest && ' (Latest)'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {videoComments.length} message{videoComments.length !== 1 ? 's' : ''}
                        </span>
                        {!isAllowed && (
                          <span className="text-xs text-warning font-medium bg-warning-visible border-2 border-warning-visible px-2 py-1 rounded">
                            Replies disabled (old version)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Messages - Scrollable area for this version only */}
                  {isExpanded && (
                    <div className="max-h-[400px] overflow-y-auto px-1 pb-3">
                      <div className="space-y-3">
                    {videoComments.map((comment) => {
                      const isStudio = comment.isInternal

                      return (
                        <div key={comment.id}>
                          {/* Main Comment */}
                          <div className={`flex ${isStudio ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] ${isStudio ? 'text-right' : 'text-left'}`}>
                              <div className={`${
                                isStudio
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-secondary text-secondary-foreground'
                              } rounded-2xl px-4 py-2 inline-block shadow-sm`}>
                                {/* Author & Info Header */}
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className={`text-xs font-medium ${isStudio ? 'text-primary-foreground/90' : 'text-secondary-foreground'}`}>
                                    {isStudio 
                                      ? (comment.user?.username || comment.user?.name || comment.user?.email || comment.authorName || 'Admin')
                                      : (comment.authorName || 'Anonymous')
                                    }
                                  </span>
                                  {isStudio && (
                                    <span className="text-xs bg-primary-foreground/20 px-2 py-0.5 rounded-full">
                                      {companyName}
                                    </span>
                                  )}
                                  {comment.timestamp !== null && comment.timestamp !== undefined && (
                                    <button
                                      onClick={() => {
                                        const url = buildTimestampUrl(comment.timestamp!, comment.videoVersion)
                                        if (url) {
                                          window.open(url, '_blank')
                                        }
                                      }}
                                      className={`text-xs ${isStudio ? 'text-primary-foreground/90' : 'text-warning'} hover:underline cursor-pointer inline-flex items-center gap-1`}
                                      title="Open share page at this timestamp"
                                    >
                                      @{formatTimestamp(comment.timestamp)}
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>

                                {/* Message Content or Edit Field */}
                                {editingCommentId === comment.id ? (
                                  <div className="space-y-2 mt-2">
                                    <Textarea
                                      ref={editInputRef}
                                      value={editContent}
                                      onChange={(e) => setEditContent(e.target.value)}
                                      className="bg-background border-border text-foreground text-sm resize-none min-w-[250px]"
                                      rows={3}
                                    />
                                    <div className="flex gap-2 justify-end">
                                      <Button
                                        onClick={() => handleEditComment(comment.id)}
                                        disabled={loading || !editContent.trim()}
                                        size="xs"
                                      >
                                        Save
                                      </Button>
                                      <Button
                                        onClick={cancelEditing}
                                        variant="ghost"
                                        size="xs"
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className={`text-sm whitespace-pre-wrap break-words ${isStudio ? 'text-primary-foreground' : 'text-secondary-foreground'}`}>
                                    {comment.content}
                                  </p>
                                )}
                              </div>

                              {/* Timestamp and Action Buttons */}
                              <div className="flex items-center gap-2 mt-1 px-2">
                                <p className="text-xs text-muted-foreground">
                                  {new Date(comment.createdAt).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                </p>
                                {editingCommentId !== comment.id && (
                                  <>
                                    {/* Edit button - only for admin's own messages */}
                                    {isStudio && comment.userId === user?.id && (
                                      <button
                                        onClick={() => startEditing(comment.id, comment.content)}
                                        className="text-xs text-muted-foreground hover:text-foreground"
                                      >
                                        Edit
                                      </button>
                                    )}
                                    {/* Delete button - admin can delete any message */}
                                    <button
                                      onClick={() => handleDeleteComment(comment.id)}
                                      className="text-xs text-destructive hover:text-destructive/80"
                                    >
                                      Delete
                                    </button>
                                    {/* Reply button - only for client messages in allowed versions */}
                                    {!isStudio && isAllowed && (
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => setReplyingTo(comment.id)}
                                      >
                                        <Reply className="w-3 h-3 mr-1" />
                                        Reply
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>                          {/* Reply Input */}
                          {replyingTo === comment.id && (
                            <div className="ml-8 mt-2 flex gap-2 items-start">
                              <Textarea
                                ref={replyInputRef}
                                placeholder={`Type your reply as ${companyName}...`}
                                value={replyContent}
                                onChange={(e) => setReplyContent(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleReply(comment.id)
                                  }
                                  if (e.key === 'Escape') {
                                    setReplyingTo(null)
                                    setReplyContent('')
                                  }
                                }}
                                className="flex-1 resize-none"
                                rows={2}
                              />
                              <div className="flex flex-col gap-1">
                                <Button
                                  onClick={() => handleReply(comment.id)}
                                  disabled={loading || !replyContent.trim()}
                                  size="sm"
                                >
                                  <Send className="w-4 h-4" />
                                </Button>
                                <Button
                                  onClick={() => {
                                    setReplyingTo(null)
                                    setReplyContent('')
                                  }}
                                  variant="ghost"
                                  size="sm"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Replies */}
                          {comment.replies && comment.replies.length > 0 && (
                            <div className="ml-8 mt-2 space-y-2">
                              {comment.replies.map((reply) => {
                                const isReplyStudio = reply.isInternal

                                return (
                                  <div key={reply.id} className={`flex ${isReplyStudio ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] ${isReplyStudio ? 'text-right' : 'text-left'}`}>
                                      <div className={`${
                                        isReplyStudio
                                          ? 'bg-primary text-primary-foreground'
                                          : 'bg-secondary text-secondary-foreground'
                                      } rounded-2xl px-4 py-2 inline-block shadow-sm`}>
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className={`text-xs font-medium ${isReplyStudio ? 'text-primary-foreground/90' : 'text-secondary-foreground'}`}>
                                            {isReplyStudio 
                                              ? (reply.user?.username || reply.user?.name || reply.user?.email || reply.authorName || 'Admin')
                                              : (reply.authorName || 'Anonymous')
                                            }
                                          </span>
                                          {isReplyStudio && (
                                            <span className="text-xs bg-primary-foreground/20 px-2 py-0.5 rounded-full">
                                              {companyName}
                                            </span>
                                          )}
                                        </div>

                                        {/* Message Content or Edit Field */}
                                        {editingCommentId === reply.id ? (
                                          <div className="space-y-2 mt-2">
                                            <Textarea
                                              ref={editInputRef}
                                              value={editContent}
                                              onChange={(e) => setEditContent(e.target.value)}
                                              className="bg-background border-border text-foreground text-sm resize-none min-w-[250px]"
                                              rows={3}
                                            />
                                            <div className="flex gap-2 justify-end">
                                              <Button
                                                onClick={() => handleEditComment(reply.id)}
                                                disabled={loading || !editContent.trim()}
                                                size="xs"
                                              >
                                                Save
                                              </Button>
                                              <Button
                                                onClick={cancelEditing}
                                                variant="ghost"
                                                size="xs"
                                              >
                                                Cancel
                                              </Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <p className={`text-sm whitespace-pre-wrap ${isReplyStudio ? 'text-primary-foreground' : 'text-secondary-foreground'}`}>
                                            {reply.content}
                                          </p>
                                        )}
                                      </div>
                                      
                                      {/* Timestamp and Action Buttons */}
                                      <div className="flex items-center gap-2 mt-1 px-2">
                                        <p className="text-xs text-muted-foreground">
                                          {new Date(reply.createdAt).toLocaleString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: 'numeric',
                                            minute: '2-digit',
                                          })}
                                        </p>
                                        {editingCommentId !== reply.id && (
                                          <>
                                            {/* Edit button - only for admin's own messages */}
                                            {isReplyStudio && reply.userId === user?.id && (
                                              <button
                                                onClick={() => startEditing(reply.id, reply.content)}
                                                className="text-xs text-muted-foreground hover:text-foreground"
                                              >
                                                Edit
                                              </button>
                                            )}
                                            {/* Delete button - admin can delete any message */}
                                            <button
                                              onClick={() => handleDeleteComment(reply.id)}
                                              className="text-xs text-destructive hover:text-destructive/80"
                                            >
                                              Delete
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* General comments (no video version) */}
            {generalComments.length > 0 && (
              <div className="border-b border-border last:border-b-0">
                {/* General Header - Clickable */}
                <div
                  className="py-3 cursor-pointer hover:bg-muted transition-colors"
                  onClick={() => toggleVersion(-1)}
                >
                  <div className="flex items-center gap-2">
                    {/* Expand/Collapse Indicator */}
                    <svg 
                      className={`w-4 h-4 transition-transform ${expandedVersions.has(-1) ? 'rotate-90' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm font-semibold px-3 py-1.5 bg-muted text-muted-foreground rounded-md">
                      General
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {generalComments.length} message{generalComments.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Messages - Scrollable area */}
                {expandedVersions.has(-1) && (
                  <div className="max-h-[400px] overflow-y-auto px-1 pb-3">
                    <div className="space-y-3">
                  {generalComments.map((comment) => {
                    const isStudio = comment.isInternal

                    return (
                      <div key={comment.id}>
                        <div className={`flex ${isStudio ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] ${isStudio ? 'text-right' : 'text-left'}`}>
                            <div className={`${
                              isStudio
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-secondary-foreground'
                            } rounded-2xl px-4 py-2 inline-block shadow-sm`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs font-medium ${isStudio ? 'text-primary-foreground/90' : 'text-secondary-foreground'}`}>
                                  {isStudio 
                                    ? (comment.user?.username || comment.user?.name || comment.user?.email || comment.authorName || 'Admin')
                                    : (comment.authorName || 'Anonymous')
                                  }
                                </span>
                                {isStudio && (
                                  <span className="text-xs bg-primary-foreground/20 px-2 py-0.5 rounded-full">
                                    {companyName}
                                  </span>
                                )}
                              </div>

                              {/* Message Content or Edit Field */}
                              {editingCommentId === comment.id ? (
                                <div className="space-y-2 mt-2">
                                  <Textarea
                                    ref={editInputRef}
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    className="bg-background border-border text-foreground text-sm resize-none min-w-[250px]"
                                    rows={3}
                                  />
                                  <div className="flex gap-2 justify-end">
                                    <Button
                                      onClick={() => handleEditComment(comment.id)}
                                      disabled={loading || !editContent.trim()}
                                      size="sm"
                                    >
                                      Save
                                    </Button>
                                    <Button
                                      onClick={cancelEditing}
                                      variant="ghost"
                                      size="sm"
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <p className={`text-sm whitespace-pre-wrap ${isStudio ? 'text-primary-foreground' : 'text-secondary-foreground'}`}>
                                  {comment.content}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 px-2">
                              <p className="text-xs text-muted-foreground">
                                {new Date(comment.createdAt).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </p>
                              {editingCommentId !== comment.id && (
                                <>
                                  {/* Edit button - only for admin's own messages */}
                                  {isStudio && comment.userId === user?.id && (
                                    <button
                                      onClick={() => startEditing(comment.id, comment.content)}
                                      className="text-xs text-muted-foreground hover:text-foreground"
                                    >
                                      Edit
                                    </button>
                                  )}
                                  {/* Delete button - admin can delete any message */}
                                  <button
                                    onClick={() => handleDeleteComment(comment.id)}
                                    className="text-xs text-destructive hover:text-destructive/80"
                                  >
                                    Delete
                                  </button>
                                  {/* Reply button - only for client messages */}
                                  {!isStudio && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => setReplyingTo(comment.id)}
                                    >
                                      <Reply className="w-3 h-3 mr-1" />
                                      Reply
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Reply Input */}
                        {replyingTo === comment.id && (
                          <div className="ml-8 mt-2 flex gap-2 items-start">
                            <Textarea
                              ref={replyInputRef}
                              placeholder="Type your reply as Studio..."
                              value={replyContent}
                              onChange={(e) => setReplyContent(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault()
                                  handleReply(comment.id)
                                }
                                if (e.key === 'Escape') {
                                  setReplyingTo(null)
                                  setReplyContent('')
                                }
                              }}
                              className="flex-1 resize-none"
                              rows={2}
                            />
                            <div className="flex flex-col gap-1">
                              <Button
                                onClick={() => handleReply(comment.id)}
                                disabled={loading || !replyContent.trim()}
                                size="sm"
                              >
                                <Send className="w-4 h-4" />
                              </Button>
                              <Button
                                onClick={() => {
                                  setReplyingTo(null)
                                  setReplyContent('')
                                }}
                                variant="ghost"
                                size="sm"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Replies */}
                        {comment.replies && comment.replies.length > 0 && (
                          <div className="ml-8 mt-2 space-y-2">
                            {comment.replies.map((reply) => {
                              const isReplyStudio = reply.isInternal

                              return (
                                <div key={reply.id} className={`flex ${isReplyStudio ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[80%] ${isReplyStudio ? 'text-right' : 'text-left'}`}>
                                    <div className={`${
                                      isReplyStudio
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-secondary text-secondary-foreground'
                                    } rounded-2xl px-4 py-2 inline-block shadow-sm`}>
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-xs font-medium ${isReplyStudio ? 'text-primary-foreground/90' : 'text-secondary-foreground'}`}>
                                          {isReplyStudio 
                                            ? (reply.user?.username || reply.user?.name || reply.user?.email || reply.authorName || 'Admin')
                                            : (reply.authorName || 'Anonymous')
                                          }
                                        </span>
                                        {isReplyStudio && (
                                          <span className="text-xs bg-primary-foreground/20 px-2 py-0.5 rounded-full">
                                            {companyName}
                                          </span>
                                        )}
                                      </div>

                                      {/* Message Content or Edit Field */}
                                      {editingCommentId === reply.id ? (
                                        <div className="space-y-2 mt-2">
                                          <Textarea
                                            ref={editInputRef}
                                            value={editContent}
                                            onChange={(e) => setEditContent(e.target.value)}
                                            className="bg-background border-border text-foreground text-sm resize-none min-w-[250px]"
                                            rows={3}
                                          />
                                          <div className="flex gap-2 justify-end">
                                            <Button
                                              onClick={() => handleEditComment(reply.id)}
                                              disabled={loading || !editContent.trim()}
                                              size="xs"
                                                    >
                                              Save
                                            </Button>
                                            <Button
                                              onClick={cancelEditing}
                                              variant="ghost"
                                              size="xs"
                                                    >
                                              Cancel
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className={`text-sm whitespace-pre-wrap ${isReplyStudio ? 'text-primary-foreground' : 'text-secondary-foreground'}`}>
                                          {reply.content}
                                        </p>
                                      )}
                                    </div>
                                    
                                    {/* Timestamp and Action Buttons */}
                                    <div className="flex items-center gap-2 mt-1 px-2">
                                      <p className="text-xs text-muted-foreground">
                                        {new Date(reply.createdAt).toLocaleString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: 'numeric',
                                          minute: '2-digit',
                                        })}
                                      </p>
                                      {editingCommentId !== reply.id && (
                                        <>
                                          {/* Edit button - only for admin's own messages */}
                                          {isReplyStudio && reply.userId === user?.id && (
                                            <button
                                              onClick={() => startEditing(reply.id, reply.content)}
                                              className="text-xs text-muted-foreground hover:text-foreground"
                                            >
                                              Edit
                                            </button>
                                          )}
                                          {/* Delete button - admin can delete any message */}
                                          <button
                                            onClick={() => handleDeleteComment(reply.id)}
                                            className="text-xs text-destructive hover:text-destructive/80"
                                          >
                                            Delete
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
