'use client'

import { useState, useEffect } from 'react'
import { Comment, Video } from '@prisma/client'
import { useRouter } from 'next/navigation'

type CommentWithReplies = Comment & {
  replies?: Comment[]
}

interface UseCommentManagementProps {
  projectId: string
  initialComments: CommentWithReplies[]
  videos: Video[]
  clientEmail?: string
  isPasswordProtected: boolean
  adminUser: any
  recipients: Array<{ id: string; name: string | null }>
  clientName: string
  restrictToLatestVersion: boolean
}

export function useCommentManagement({
  projectId,
  initialComments,
  videos,
  clientEmail,
  isPasswordProtected,
  adminUser,
  recipients,
  clientName,
  restrictToLatestVersion,
}: UseCommentManagementProps) {
  const router = useRouter()

  // State
  const [optimisticComments, setOptimisticComments] = useState<CommentWithReplies[]>([])
  const [newComment, setNewComment] = useState('')
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null)
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasAutoFilledTimestamp, setHasAutoFilledTimestamp] = useState(false)
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null)

  // Author name management
  const displayClientName = isPasswordProtected ? clientName : 'Client'
  const namedRecipients = recipients.filter(r => r.name && r.name.trim() !== '')
  const initialAuthorName = namedRecipients[0]?.name || displayClientName || ''

  const [authorName, setAuthorName] = useState(initialAuthorName)
  const [nameSource, setNameSource] = useState<'recipient' | 'custom'>('recipient')
  const [selectedRecipientId, setSelectedRecipientId] = useState(namedRecipients[0]?.id || '')

  // Merge real comments with optimistic comments
  const activeOptimisticComments = optimisticComments.filter(oc => {
    const hasRealVersion = initialComments.some(rc =>
      rc.content === oc.content &&
      Math.abs(new Date(rc.createdAt).getTime() - new Date(oc.createdAt).getTime()) < 5000
    )
    return !hasRealVersion
  })

  // Merge optimistic comments properly (nest replies under parent comments)
  const mergedComments = initialComments.map(comment => {
    // Find optimistic replies for this comment
    const optimisticReplies = activeOptimisticComments.filter(oc => oc.parentId === comment.id)

    if (optimisticReplies.length > 0) {
      return {
        ...comment,
        replies: [...(comment.replies || []), ...optimisticReplies]
      }
    }
    return comment
  })

  // Add optimistic top-level comments (no parentId)
  const optimisticTopLevel = activeOptimisticComments.filter(oc => !oc.parentId)
  const comments = [...mergedComments, ...optimisticTopLevel]

  // Auto-select first video when videos list changes (admin panel without player)
  useEffect(() => {
    if (videos.length > 0 && !selectedVideoId) {
      setSelectedVideoId(videos[0].id)
    }
  }, [videos, selectedVideoId])

  // Sync with video player if available (share page with player)
  useEffect(() => {
    const syncCurrentVideo = () => {
      window.dispatchEvent(
        new CustomEvent('getSelectedVideoId', {
          detail: {
            callback: (videoId: string) => {
              if (videoId && videoId !== selectedVideoId) {
                setSelectedVideoId(videoId)
              }
            },
          },
        })
      )
    }

    syncCurrentVideo()
    const interval = setInterval(syncCurrentVideo, 1000)
    return () => clearInterval(interval)
  }, [selectedVideoId])

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

  // Auto-fill timestamp when user starts typing
  const handleCommentChange = (value: string) => {
    setNewComment(value)

    if (value.length > 0 && !hasAutoFilledTimestamp && selectedTimestamp === null) {
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

  // Submit comment
  const handleSubmitComment = async () => {
    if (!newComment.trim()) return

    if (!selectedVideoId) {
      alert('Please select a video before commenting.')
      return
    }

    const validatedVideoId: string = selectedVideoId

    // Check if commenting on latest version only
    if (restrictToLatestVersion) {
      const latestVideoVersion = videos.length > 0 ? Math.max(...videos.map(v => v.version)) : null
      const selectedVideo = videos.find(v => v.id === validatedVideoId)
      if (selectedVideo && selectedVideo.version !== latestVideoVersion) {
        alert('Comments are only allowed on the latest version of this project.')
        return
      }
    }

    setLoading(true)

    // OPTIMISTIC UPDATE
    const isInternalComment = !!adminUser
    const optimisticComment: CommentWithReplies = {
      id: `temp-${Date.now()}`,
      projectId,
      videoId: validatedVideoId,
      videoVersion: videos.find(v => v.id === validatedVideoId)?.version || null,
      timestamp: selectedTimestamp,
      content: newComment,
      authorName: isInternalComment
        ? (adminUser.name || adminUser.email)
        : (isPasswordProtected ? authorName : 'Client'),
      authorEmail: isInternalComment ? adminUser.email : (clientEmail || null),
      isInternal: isInternalComment,
      createdAt: new Date(),
      updatedAt: new Date(),
      parentId: replyingToCommentId,
      userId: null,
      replies: [],
    }

    setOptimisticComments(prev => [...prev, optimisticComment])

    // Clear form immediately (but keep video selected for next comment)
    const commentContent = newComment
    const commentTimestamp = selectedTimestamp
    const commentVideoId = validatedVideoId
    const commentParentId = replyingToCommentId
    setNewComment('')
    setSelectedTimestamp(null)
    // Keep selectedVideoId so user can post multiple comments
    setHasAutoFilledTimestamp(false)
    setReplyingToCommentId(null)

    try {
      // Build request body - only include fields with values
      const requestBody: any = {
        projectId,
        videoId: commentVideoId,
        timestamp: commentTimestamp,
        content: commentContent,
        isInternal: isInternalComment,
      }

      // Add optional fields only if they have values
      if (isInternalComment) {
        requestBody.authorName = adminUser.name || adminUser.email
        if (adminUser.email) requestBody.authorEmail = adminUser.email
      } else {
        if (authorName) requestBody.authorName = authorName
        if (clientEmail) requestBody.authorEmail = clientEmail
        if (nameSource === 'recipient' && selectedRecipientId) {
          requestBody.recipientId = selectedRecipientId
        }
      }

      // Only include parentId if replying (not null)
      if (commentParentId) {
        requestBody.parentId = commentParentId
      }

      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `Server error: ${response.status}`)
      }

      router.refresh()
    } catch (error) {
      // Remove optimistic comment and restore form
      setOptimisticComments(prev => prev.filter(c => c.id !== optimisticComment.id))
      setNewComment(commentContent)
      setSelectedTimestamp(commentTimestamp)
      setSelectedVideoId(commentVideoId)
      alert(`Failed to submit comment: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleReply = (commentId: string, videoId: string) => {
    setReplyingToCommentId(commentId)
    setSelectedVideoId(videoId)
  }

  const handleCancelReply = () => {
    setReplyingToCommentId(null)
  }

  const handleClearTimestamp = () => {
    setSelectedTimestamp(null)
    setSelectedVideoId(null)
    setHasAutoFilledTimestamp(false)
  }

  const handleNameSourceChange = (source: 'recipient' | 'custom', recipientId?: string) => {
    setNameSource(source)
    if (source === 'custom') {
      setAuthorName('')
    } else if (recipientId) {
      setSelectedRecipientId(recipientId)
      const selected = namedRecipients.find(r => r.id === recipientId)
      setAuthorName(selected?.name || '')
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!adminUser) {
      alert('Only admins can delete comments')
      return
    }

    if (!confirm('Are you sure you want to delete this comment? This action cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `Server error: ${response.status}`)
      }

      // Trigger immediate re-fetch via window event (CommentSection polling will pick it up)
      window.dispatchEvent(new CustomEvent('commentDeleted'))
    } catch (error) {
      alert(`Failed to delete comment: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return {
    comments,
    newComment,
    selectedTimestamp,
    selectedVideoId,
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
  }
}
