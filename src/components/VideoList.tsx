'use client'

import { useState, useEffect } from 'react'
import { Video } from '@prisma/client'
import { formatDuration, formatFileSize } from '@/lib/utils'
import { Progress } from './ui/progress'
import { Button } from './ui/button'
import { ReprocessModal } from './ReprocessModal'
import { InlineEdit } from './InlineEdit'
import { Trash2, CheckCircle2, XCircle, Pencil, MessageSquare, Upload } from 'lucide-react'
import { apiPost, apiPatch, apiDelete } from '@/lib/api-client'
import { VideoAssetUpload } from './VideoAssetUpload'
import { VideoAssetList } from './VideoAssetList'

interface VideoListProps {
  videos: Video[]
  isAdmin?: boolean
  onRefresh?: () => void
}

export default function VideoList({ videos: initialVideos, isAdmin = true, onRefresh }: VideoListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [videos, setVideos] = useState<Video[]>(initialVideos)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [showReprocessModal, setShowReprocessModal] = useState(false)
  const [pendingVideoUpdate, setPendingVideoUpdate] = useState<{ videoId: string; newLabel: string } | null>(null)
  const [reprocessing, setReprocessing] = useState(false)
  const [uploadingAssetsFor, setUploadingAssetsFor] = useState<string | null>(null)
  const [assetRefreshTrigger, setAssetRefreshTrigger] = useState(0)

  // Poll for updates when there are processing videos
  useEffect(() => {
    const hasProcessingVideos = videos.some(
      v => v.status === 'PROCESSING' || v.status === 'UPLOADING'
    )

    if (!hasProcessingVideos) {
      return
    }

    // Refresh page data every 2 seconds when videos are processing
    const interval = setInterval(() => {
      // Use callback instead of router.refresh for better performance
      onRefresh?.()
    }, 2000)

    return () => clearInterval(interval)
  }, [videos, onRefresh])

  // Update local state when props change
  useEffect(() => {
    setVideos(initialVideos)
  }, [initialVideos])

  const handleDelete = async (videoId: string) => {
    if (!confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
      return
    }

    setDeletingId(videoId)
    try {
      await apiDelete(`/api/videos/${videoId}`)
      await onRefresh?.()
    } catch (error) {
      alert('Failed to delete video')
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleApproval = async (videoId: string, currentlyApproved: boolean) => {
    const action = currentlyApproved ? 'unapprove' : 'approve'
    if (!confirm(`Are you sure you want to ${action} this video?`)) {
      return
    }

    setApprovingId(videoId)
    try {
      await apiPatch(`/api/videos/${videoId}`, { approved: !currentlyApproved })

      // Trigger immediate UI update for comment section approval banner
      window.dispatchEvent(new CustomEvent('videoApprovalChanged'))

      await onRefresh?.()
    } catch (error) {
      alert(`Failed to ${action} video`)
    } finally {
      setApprovingId(null)
    }
  }

  const handleStartEdit = (videoId: string, currentLabel: string) => {
    setEditingId(videoId)
    setEditValue(currentLabel)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditValue('')
  }

  const handleSaveEdit = async (videoId: string) => {
    if (!editValue.trim()) {
      alert('Version label cannot be empty')
      return
    }

    // Show reprocessing modal since version label affects watermark
    setPendingVideoUpdate({ videoId, newLabel: editValue.trim() })
    setShowReprocessModal(true)
  }

  const saveVersionLabel = async (shouldReprocess: boolean) => {
    if (!pendingVideoUpdate) return

    setSavingId(pendingVideoUpdate.videoId)
    try {
      await apiPatch(`/api/videos/${pendingVideoUpdate.videoId}`, { versionLabel: pendingVideoUpdate.newLabel })

      // Reprocess if requested
      if (shouldReprocess) {
        await reprocessVideo(pendingVideoUpdate.videoId)
      }

      setEditingId(null)
      setEditValue('')
      setPendingVideoUpdate(null)
      setShowReprocessModal(false)
      await onRefresh?.()
    } catch (error) {
      alert('Failed to update version label')
    } finally {
      setSavingId(null)
    }
  }

  const reprocessVideo = async (videoId: string) => {
    setReprocessing(true)
    try {
      const video = videos.find(v => v.id === videoId)
      if (!video) return

      await apiPost(`/api/projects/${video.projectId}/reprocess`, { videoIds: [videoId] })

    } catch (err) {
      // Don't throw - we still want to save the label
    } finally {
      setReprocessing(false)
    }
  }

  const handleShowComments = (videoId: string) => {
    // Dispatch event to update CommentSection to show this video's comments
    window.dispatchEvent(new CustomEvent('selectVideoForComments', {
      detail: { videoId }
    }))

    // Scroll to comment section smoothly
    const commentSection = document.querySelector('[data-comment-section]')
    if (commentSection) {
      commentSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (videos.length === 0) {
    return <p className="text-sm text-muted-foreground">No videos uploaded yet</p>
  }

  return (
    <div className="space-y-4">
      {videos.map((video) => (
        <div key={video.id} className="border rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3">
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {editingId === video.id ? (
                  <InlineEdit
                    value={editValue}
                    onChange={setEditValue}
                    onSave={() => handleSaveEdit(video.id)}
                    onCancel={handleCancelEdit}
                    disabled={savingId === video.id}
                    inputClassName="h-8 w-full sm:w-48"
                  />
                ) : (
                  <>
                    <h4 className="font-medium break-words">{video.versionLabel}</h4>
                    {isAdmin && video.status === 'READY' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary-visible flex-shrink-0"
                        onClick={() => handleStartEdit(video.id, video.versionLabel)}
                        title="Edit version label"
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                    )}
                    {(video as any).approved && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-success-visible text-success border border-success-visible whitespace-nowrap flex-shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        Approved
                      </span>
                    )}
                  </>
                )}
              </div>
              {editingId !== video.id && (
                <p className="text-sm text-muted-foreground break-all">{video.originalFileName}</p>
              )}
            </div>
            {/* Action icons - right side on all screen sizes */}
            {editingId !== video.id && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Only show status badge for PROCESSING and ERROR states */}
                {(video.status === 'PROCESSING' || video.status === 'ERROR') && (
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${
                      video.status === 'PROCESSING'
                        ? 'bg-primary-visible text-primary border-2 border-primary-visible'
                        : 'bg-destructive-visible text-destructive border-2 border-destructive-visible'
                    }`}
                  >
                    {video.status === 'PROCESSING' && (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                    )}
                    {video.status}
                  </span>
                )}
                {isAdmin && video.status === 'READY' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleApproval(video.id, (video as any).approved || false)}
                    disabled={approvingId === video.id}
                    className={(video as any).approved
                      ? "text-warning hover:text-warning hover:bg-warning-visible"
                      : "text-success hover:text-success hover:bg-success-visible"
                    }
                    title={(video as any).approved ? "Unapprove video" : "Approve video"}
                  >
                    {(video as any).approved ? (
                      <XCircle className="w-4 h-4" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                  </Button>
                )}
                {isAdmin && video.status === 'READY' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleShowComments(video.id)}
                    className="text-primary hover:text-primary hover:bg-primary-visible"
                    title="Show Feedback & Discussion"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </Button>
                )}
                {isAdmin && video.status === 'READY' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setUploadingAssetsFor(uploadingAssetsFor === video.id ? null : video.id)}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    title="Upload Assets"
                  >
                    <Upload className="w-4 h-4" />
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(video.id)}
                    disabled={deletingId === video.id}
                    className="text-destructive hover:text-destructive hover:bg-destructive-visible"
                    title="Delete video"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {video.status === 'PROCESSING' && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Processing previews...</span>
              </div>
              <div className="relative h-4 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full w-full bg-primary animate-striped"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.2) 10px, rgba(255,255,255,0.2) 20px)',
                    backgroundSize: '28px 28px',
                    animation: 'move-stripes 1s linear infinite'
                  }}
                />
              </div>
            </div>
          )}

          {video.status === 'ERROR' && video.processingError && (
            <p className="text-sm text-destructive">{video.processingError}</p>
          )}

          {video.status === 'READY' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
              <div>
                <p className="text-muted-foreground">Duration</p>
                <p className="font-medium">{formatDuration(video.duration)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Resolution</p>
                <p className="font-medium">
                  {video.width}x{video.height}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Size</p>
                <p className="font-medium">{formatFileSize(Number(video.originalFileSize))}</p>
              </div>
            </div>
          )}

          {/* Asset upload section */}
          {isAdmin && uploadingAssetsFor === video.id && video.status === 'READY' && (
            <div className="mt-4 pt-4 border-t space-y-4">
              <div>
                <h5 className="text-sm font-medium mb-3">Upload Additional Assets</h5>
                <VideoAssetUpload
                  videoId={video.id}
                  onUploadComplete={() => {
                    setUploadingAssetsFor(null)
                    setAssetRefreshTrigger(prev => prev + 1) // Trigger asset list refresh
                    onRefresh?.()
                  }}
                />
              </div>
            </div>
          )}

          {/* Asset list section - always visible for READY videos if admin */}
          {isAdmin && video.status === 'READY' && (
            <div className="mt-4 pt-4 border-t">
              <VideoAssetList
                videoId={video.id}
                onAssetDeleted={() => {
                  setAssetRefreshTrigger(prev => prev + 1)
                  onRefresh?.()
                }}
                refreshTrigger={assetRefreshTrigger}
              />
            </div>
          )}
        </div>
      ))}

      <ReprocessModal
        show={showReprocessModal}
        onCancel={() => {
          setShowReprocessModal(false)
          setPendingVideoUpdate(null)
          setSavingId(null)
        }}
        onSaveWithoutReprocess={() => saveVersionLabel(false)}
        onSaveAndReprocess={() => saveVersionLabel(true)}
        saving={savingId !== null}
        reprocessing={reprocessing}
        title="Version Label Changed"
        description="Version labels appear in watermarks. The change will only apply to newly uploaded videos."
        isSingleVideo={true}
      />
    </div>
  )
}
