'use client'

import { useState, useEffect } from 'react'
import { Comment, Video } from '@prisma/client'
import { useRouter } from 'next/navigation'
import { apiPost, apiDelete } from '@/lib/api-client'
import { secondsToTimecode } from '@/lib/timecode'

type CommentWithReplies = Comment & {
  replies?: Comment[]
}

interface UseCommentManagementProps {
  projectId: string
  initialComments: CommentWithReplies[]
  videos: Video[]
  clientEmail?: string
  isPasswordProtected: boolean
  adminUser?: any
  recipients: Array<{ id: string; name: string | null }>
  clientName: string
  restrictToLatestVersion: boolean
  shareToken?: string | null
  useAdminAuth?: boolean
  companyName?: string
}

export function useCommentManagement({
  projectId,
  initialComments,
  videos,
  clientEmail,
  isPasswordProtected,
  adminUser = null,
  recipients,
  clientName,
  restrictToLatestVersion,
  shareToken = null,
  useAdminAuth = false,
  companyName = 'Studio',
}: UseCommentManagementProps) {
  const router = useRouter()

  // State
  const [optimisticComments, setOptimisticComments] = useState<CommentWithReplies[]>([])
  const [newComment, setNewComment] = useState('')
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null) // Internal: still use seconds for video player integration
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasAutoFilledTimestamp, setHasAutoFilledTimestamp] = useState(false)
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null)

  // Author name management
  const displayClientName = isPasswordProtected ? clientName : 'Client'
  const namedRecipients = recipients.filter(r => r.name && r.name.trim() !== '')

  // Load persisted name selection from sessionStorage (survives commenting but not page refresh)
  const storageKey = `comment-name-${projectId}`
  const loadPersistedName = () => {
    if (typeof window === 'undefined') return null
    try {
      const stored = sessionStorage.getItem(storageKey)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  }

  const persistedName = loadPersistedName()
  const [authorName, setAuthorName] = useState(persistedName?.authorName || '')
  const [nameSource, setNameSource] = useState<'recipient' | 'custom' | 'none'>(persistedName?.nameSource || 'none')
  const [selectedRecipientId, setSelectedRecipientId] = useState(persistedName?.selectedRecipientId || '')

  // Merge real comments with optimistic comments
  // Remove optimistic comments that have been confirmed by the server
  const activeOptimisticComments = optimisticComments.filter(oc => {
    // If this optimistic comment has a temp ID, check if a real version exists
    if (oc.id.startsWith('temp-')) {
      // Check top-level comments for matching content and similar timestamp
      const hasRealVersionTopLevel = initialComments.some(rc =>
        rc.content === oc.content &&
        rc.videoId === oc.videoId &&
        Math.abs(new Date(rc.createdAt).getTime() - new Date(oc.createdAt).getTime()) < 10000
      )

      // Check nested replies for matching content and similar timestamp
      const hasRealVersionInReplies = initialComments.some(rc =>
        rc.replies?.some((reply: any) =>
          reply.content === oc.content &&
          reply.videoId === oc.videoId &&
          Math.abs(new Date(reply.createdAt).getTime() - new Date(oc.createdAt).getTime()) < 10000
        )
      )

      return !hasRealVersionTopLevel && !hasRealVersionInReplies
    }

    // Keep non-temp comments (shouldn't happen, but safe fallback)
    return true
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
  // Reduced from 1s to 5s to prevent UI lag during heavy interaction
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
    const interval = setInterval(syncCurrentVideo, 5000) // Changed from 1000ms to 5000ms
    return () => clearInterval(interval)
  }, [selectedVideoId])

  // Listen for immediate video changes from VideoPlayer (for responsive comment updates)
  useEffect(() => {
    const handleVideoChange = (e: CustomEvent) => {
      const { videoId } = e.detail
      if (videoId && videoId !== selectedVideoId) {
        setSelectedVideoId(videoId)
      }
    }

    window.addEventListener('videoChanged', handleVideoChange as EventListener)
    return () => {
      window.removeEventListener('videoChanged', handleVideoChange as EventListener)
    }
  }, [selectedVideoId])

  // Listen for video selection from admin page (message icon clicks)
  useEffect(() => {
    const handleSelectVideo = (e: CustomEvent) => {
      const { videoId } = e.detail
      if (videoId) {
        setSelectedVideoId(videoId)
      }
    }

    window.addEventListener('selectVideoForComments', handleSelectVideo as EventListener)
    return () => {
      window.removeEventListener('selectVideoForComments', handleSelectVideo as EventListener)
    }
  }, [])

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

  // Keep selectedTimestamp in sync when the user frame-steps while commenting
  useEffect(() => {
    const handleVideoTimeUpdated = (e: CustomEvent) => {
      const time = e.detail?.time
      const videoId = e.detail?.videoId

      if (typeof time !== 'number') return
      if (!videoId || videoId !== selectedVideoId) return
      if (!hasAutoFilledTimestamp || selectedTimestamp === null) return

      setSelectedTimestamp(time)
    }

    window.addEventListener('videoTimeUpdated', handleVideoTimeUpdated as EventListener)
    return () => {
      window.removeEventListener('videoTimeUpdated', handleVideoTimeUpdated as EventListener)
    }
  }, [hasAutoFilledTimestamp, selectedTimestamp, selectedVideoId])

  // Auto-fill timestamp when user starts typing
  const handleCommentChange = (value: string) => {
    setNewComment(value)

    if (value.length > 0 && !hasAutoFilledTimestamp && selectedTimestamp === null) {
      // Pause video and capture timestamp when user starts typing
      window.dispatchEvent(new CustomEvent('pauseVideoForComment'))

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

    // Prevent rapid-fire submissions
    if (loading) return

    if (!selectedVideoId) {
      alert('Please select a video before commenting.')
      return
    }

    if (useAdminAuth && !adminUser) {
      alert('Admin session not loaded yet. Please wait a moment and try again.')
      return
    }

    // Prevent anonymous comments when named recipients are available
    if (!useAdminAuth && isPasswordProtected && namedRecipients.length > 0 && nameSource === 'none') {
      alert('Please select your name from the dropdown or choose "Custom Name" before commenting.')
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
    const isInternalComment = useAdminAuth || !!adminUser
    // Convert seconds to timecode for API and storage
    const selectedVideo = videos.find(v => v.id === validatedVideoId)
    const fps = selectedVideo?.fps || 24 // Default to 24fps if not available
    const timecode = selectedTimestamp !== null ? secondsToTimecode(selectedTimestamp, fps) : '00:00:00:00'

    const optimisticComment: CommentWithReplies = {
      id: `temp-${Date.now()}`,
      projectId,
      videoId: validatedVideoId,
      videoVersion: videos.find(v => v.id === validatedVideoId)?.version || null,
      timecode,
      content: newComment,
      authorName: isInternalComment
        ? (adminUser!.name || 'Admin')
        : (isPasswordProtected ? authorName : 'Client'),
      authorEmail: isInternalComment ? null : (clientEmail || null),
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
      // Convert timestamp to timecode for API
      const commentVideo = videos.find(v => v.id === commentVideoId)
      const fps = commentVideo?.fps || 24
      const commentTimecode = commentTimestamp !== null ? secondsToTimecode(commentTimestamp, fps) : '00:00:00:00'

      // Build request body - only include fields with values
      const requestBody: any = {
        projectId,
        videoId: commentVideoId,
        timecode: commentTimecode,
        content: commentContent,
        isInternal: isInternalComment,
      }

      // Add optional fields only if they have values
      if (isInternalComment) {
        requestBody.authorName = adminUser!.name || 'Admin'
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

      // Submit comment in background without blocking UI
      const submitPromise = shareToken
        ? fetch('/api/comments', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${shareToken}`,
            },
            body: JSON.stringify(requestBody),
          }).then(async response => {
            if (!response.ok) {
              const err = await response.json().catch(() => ({}))
              throw new Error(err.error || 'Failed to submit comment')
            }
            return response.json() // Return the updated comments list
          })
        : useAdminAuth
        ? apiPost('/api/comments', requestBody) // apiPost already returns parsed JSON
        : Promise.reject(new Error('Authentication required to submit comment'))

      // Handle submission result in background
      submitPromise
        .then((updatedComments) => {
          // Clear the optimistic comment immediately since we have real data
          setOptimisticComments(prev => prev.filter(c => c.id !== optimisticComment.id))

          // Refresh in background (non-blocking)
          router.refresh()

          // Trigger immediate update with the fresh comments data
          window.dispatchEvent(new CustomEvent('commentPosted', {
            detail: { comments: updatedComments }
          }))
        })
        .catch((error) => {
          // Remove optimistic comment and restore form on error
          setOptimisticComments(prev => prev.filter(c => c.id !== optimisticComment.id))
          setNewComment(commentContent)
          setSelectedTimestamp(commentTimestamp)
          setSelectedVideoId(commentVideoId)
          alert(`Failed to submit comment: ${error instanceof Error ? error.message : 'Unknown error'}`)
        })

      // UI is already unblocked - loading state cleared immediately
    } catch (error) {
      // Handle synchronous errors only
      setOptimisticComments(prev => prev.filter(c => c.id !== optimisticComment.id))
      setNewComment(commentContent)
      setSelectedTimestamp(commentTimestamp)
      setSelectedVideoId(commentVideoId)
      alert(`Failed to submit comment: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      // Clear loading immediately so UI is not blocked
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

  const handleNameSourceChange = (source: 'recipient' | 'custom' | 'none', recipientId?: string) => {
    setNameSource(source)
    let newAuthorName = ''
    let newRecipientId = ''

    if (source === 'custom') {
      newAuthorName = ''
    } else if (source === 'none') {
      newAuthorName = ''
      newRecipientId = ''
    } else if (recipientId) {
      newRecipientId = recipientId
      const selected = namedRecipients.find(r => r.id === recipientId)
      newAuthorName = selected?.name || ''
    }

    setAuthorName(newAuthorName)
    setSelectedRecipientId(newRecipientId)

    // Persist to sessionStorage
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        nameSource: source,
        authorName: newAuthorName,
        selectedRecipientId: newRecipientId,
      }))
    } catch {
      // Ignore storage errors
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!(useAdminAuth || adminUser)) {
      alert('Only admins can delete comments')
      return
    }

    if (!confirm('Are you sure you want to delete this comment? This action cannot be undone.')) {
      return
    }

    try {
      if (shareToken) {
        const response = await fetch(`/api/comments/${commentId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${shareToken}`,
          },
        })
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.error || 'Failed to delete comment')
        }
      } else if (useAdminAuth) {
        await apiDelete(`/api/comments/${commentId}`)
      } else {
        throw new Error('Authentication required to delete comment')
      }

      // Trigger immediate re-fetch via window event (CommentSection polling will pick it up)
      window.dispatchEvent(new CustomEvent('commentDeleted'))
    } catch (error) {
      alert(`Failed to delete comment: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Wrapper for setAuthorName that also persists to sessionStorage
  const handleAuthorNameChange = (name: string) => {
    setAuthorName(name)

    // Persist to sessionStorage when custom name is being typed
    if (nameSource === 'custom') {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({
          nameSource,
          authorName: name,
          selectedRecipientId,
        }))
      } catch {
        // Ignore storage errors
      }
    }
  }

  // Get FPS of currently selected video
  const selectedVideo = videos.find(v => v.id === selectedVideoId)
  const selectedVideoFps = selectedVideo?.fps || 24

  return {
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
    setAuthorName: handleAuthorNameChange,
    handleNameSourceChange,
  }
}
