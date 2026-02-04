'use client'

import { useState, useEffect } from 'react'
import { Video } from '@prisma/client'
import { formatDuration, formatFileSize } from '@/lib/utils'
import { Progress } from './ui/progress'
import { Button } from './ui/button'
import { ReprocessModal } from './ReprocessModal'
import { InlineEdit } from './InlineEdit'
import { Trash2, CheckCircle2, XCircle, Pencil, Upload, Download, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react'
import { apiPost, apiPatch, apiDelete, apiFetch } from '@/lib/api-client'
import { VideoAssetUploadQueue } from './VideoAssetUploadQueue'
import { VideoAssetList } from './VideoAssetList'

interface VideoListProps {
  videos: Video[]
  isAdmin?: boolean
  onRefresh?: () => void
}

export default function VideoList({ videos: initialVideos, isAdmin = true, onRefresh }: VideoListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [videos, setVideos] = useState<Video[]>(initialVideos)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [showReprocessModal, setShowReprocessModal] = useState(false)
  const [pendingVideoUpdate, setPendingVideoUpdate] = useState<{ videoId: string; newLabel: string } | null>(null)
  const [reprocessing, setReprocessing] = useState(false)
  const [uploadingAssetsFor, setUploadingAssetsFor] = useState<string | null>(null)
  const [assetRefreshTrigger, setAssetRefreshTrigger] = useState(0)

  // Version collapsing state - only latest version expanded by default
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(() => {
    const sorted = [...initialVideos].sort((a, b) => b.version - a.version)
    return new Set(sorted[0]?.id ? [sorted[0].id] : [])
  })
  const [showAllVersions, setShowAllVersions] = useState(false)

  // Polling removed from VideoList to prevent duplicate polling
  // Parent component (Project page) handles polling for processing videos

  // Update local state when props change
  useEffect(() => {
    setVideos(initialVideos)
  }, [initialVideos])

  // Recalculate expanded versions when videos change (but only if not showing all)
  useEffect(() => {
    if (!showAllVersions) {
      const sorted = [...initialVideos].sort((a, b) => b.version - a.version)
      setExpandedVersions(new Set(sorted[0]?.id ? [sorted[0].id] : []))
    }
  }, [initialVideos, showAllVersions])

  const handleDelete = async (videoId: string) => {
    // Prevent double-clicks during deletion
    if (deletingId) return

    if (!confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
      return
    }

    setDeletingId(videoId)

    // Optimistically remove from UI immediately
    setVideos(prev => prev.filter(v => v.id !== videoId))

    // Perform deletion in background without blocking UI
    apiDelete(`/api/videos/${videoId}`)
      .then(() => {
        // Refresh in background
        onRefresh?.()
      })
      .catch((error) => {
        // Restore video on error
        setVideos(initialVideos)
        alert('Failed to delete video')
      })
      .finally(() => {
        setDeletingId(null)
      })
  }

  const handleToggleApproval = async (videoId: string, currentlyApproved: boolean) => {
    // Prevent double-clicks during approval toggle
    if (approvingId) return

    const action = currentlyApproved ? 'unapprove' : 'approve'
    if (!confirm(`Are you sure you want to ${action} this video?`)) {
      return
    }

    setApprovingId(videoId)

    // Optimistically update UI immediately
    setVideos(prev => prev.map(v =>
      v.id === videoId ? { ...v, approved: !currentlyApproved } as Video : v
    ))

    // Trigger immediate UI update for comment section approval banner
    window.dispatchEvent(new CustomEvent('videoApprovalChanged'))

    // Perform approval in background without blocking UI
    apiPatch(`/api/videos/${videoId}`, { approved: !currentlyApproved })
      .then(() => {
        // Refresh in background
        onRefresh?.()
      })
      .catch((error) => {
        // Revert optimistic update on error
        setVideos(prev => prev.map(v =>
          v.id === videoId ? { ...v, approved: currentlyApproved } as Video : v
        ))
        alert(`Failed to ${action} video`)
      })
      .finally(() => {
        setApprovingId(null)
      })
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

  const triggerDownload = (url: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = ''
    link.rel = 'noopener'
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDownloadVideo = async (videoId: string) => {
    // Prevent multiple simultaneous download requests
    if (downloadingId) return

    setDownloadingId(videoId)

    // Generate download token and open link - non-blocking
    apiFetch(`/api/videos/${videoId}/download-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Download failed' }))
          throw new Error(errorData.error || 'Failed to generate download link')
        }
        return response.json()
      })
      .then(({ url }) => {
        triggerDownload(url)
      })
      .catch((error) => {
        console.error('Download error:', error)
        alert(error instanceof Error ? error.message : 'Failed to generate download link')
      })
      .finally(() => {
        setDownloadingId(null)
      })
  }

  const toggleVersion = (videoId: string) => {
    setExpandedVersions(prev => {
      const next = new Set(prev)
      if (next.has(videoId)) {
        next.delete(videoId)
      } else {
        next.add(videoId)
      }
      return next
    })
  }

  const handleShowAllVersions = () => {
    if (showAllVersions) {
      // Collapse back to just latest
      const sorted = [...videos].sort((a, b) => b.version - a.version)
      setExpandedVersions(new Set(sorted[0]?.id ? [sorted[0].id] : []))
    } else {
      // Expand all
      setExpandedVersions(new Set(videos.map(v => v.id)))
    }
    setShowAllVersions(!showAllVersions)
  }

  // Sort videos by version descending (latest first)
  const sortedVideos = [...videos].sort((a, b) => b.version - a.version)
  const latestVideoId = sortedVideos[0]?.id

  if (videos.length === 0) {
    return <p className="text-sm text-muted-foreground">No videos uploaded yet</p>
  }

  // Render collapsed version row (compact)
  const renderCollapsedVersion = (video: Video) => (
    <div
      key={video.id}
      className="flex items-center gap-3 py-2 px-3 bg-muted/50 rounded-md hover:bg-muted/70 transition-colors"
    >
      <span className="font-mono text-sm font-medium">{video.versionLabel}</span>
      {(video as any).approved && (
        <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
      )}
      {video.status === 'PROCESSING' && (
        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-primary-visible text-primary flex items-center gap-1">
          <div className="animate-spin rounded-full h-2 w-2 border-b border-primary"></div>
          Processing
        </span>
      )}
      {video.status === 'ERROR' && (
        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-destructive-visible text-destructive">
          Error
        </span>
      )}
      <span className="text-sm text-muted-foreground truncate flex-1">
        {video.originalFileName}
      </span>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => toggleVersion(video.id)}
          title="Expand version"
        >
          <ChevronDown className="w-4 h-4" />
        </Button>
        {isAdmin && video.status === 'READY' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleToggleApproval(video.id, (video as any).approved || false)}
            disabled={approvingId === video.id}
            className={(video as any).approved
              ? "h-7 w-7 text-warning hover:text-warning hover:bg-warning-visible"
              : "h-7 w-7 text-success hover:text-success hover:bg-success-visible"
            }
            title={(video as any).approved ? "Unapprove" : "Approve"}
          >
            {(video as any).approved ? (
              <XCircle className="w-3.5 h-3.5" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive-visible"
            onClick={() => handleDelete(video.id)}
            disabled={deletingId === video.id}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  )

  // Render expanded version (full card)
  const renderExpandedVersion = (video: Video, isLatest: boolean) => (
    <div key={video.id} className="border rounded-lg p-2 sm:p-3 space-y-2">
      {/* Top row: Approved badge + Version label + Action buttons */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
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
              {(video as any).approved && (
                <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
              )}
              <h4 className="font-medium truncate">{video.versionLabel}</h4>
              {isLatest && videos.length > 1 && (
                <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                  Latest
                </span>
              )}
              {isAdmin && video.status === 'READY' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:bg-primary-visible hover:text-primary"
                  onClick={() => handleStartEdit(video.id, video.versionLabel)}
                  title="Edit version label"
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              )}
            </>
          )}
        </div>
        {/* Action icons - wrap on mobile */}
        {editingId !== video.id && (
          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
            {/* Collapse button for non-latest versions */}
            {videos.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => toggleVersion(video.id)}
                title="Collapse version"
              >
                <ChevronUp className="w-4 h-4" />
              </Button>
            )}
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
                className={`h-8 w-8 ${(video as any).approved
                  ? "text-warning hover:text-warning hover:bg-warning-visible"
                  : "text-success hover:text-success hover:bg-success-visible"
                }`}
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
                className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                onClick={() => setUploadingAssetsFor(uploadingAssetsFor === video.id ? null : video.id)}
                title="Upload Assets"
              >
                <Upload className="w-4 h-4" />
              </Button>
            )}
            {isAdmin && video.status === 'READY' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                onClick={() => handleDownloadVideo(video.id)}
                disabled={downloadingId === video.id}
                title="Download Video"
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive-visible"
                onClick={() => handleDelete(video.id)}
                disabled={deletingId === video.id}
                title="Delete video"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Bottom row: Filename */}
      {editingId !== video.id && (
        <div>
          <p className="text-sm text-muted-foreground break-all">{video.originalFileName}</p>
        </div>
      )}

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="font-medium">{formatDuration(video.duration)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">FPS</p>
            <p className="font-medium">{video.fps ? `${video.fps.toFixed(2)}` : 'N/A'}</p>
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
            <VideoAssetUploadQueue
              videoId={video.id}
              maxConcurrent={3}
              onUploadComplete={() => {
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
            videoName={video.name}
            versionLabel={video.versionLabel}
            projectId={video.projectId}
            onAssetDeleted={() => {
              setAssetRefreshTrigger(prev => prev + 1)
              onRefresh?.()
            }}
            refreshTrigger={assetRefreshTrigger}
          />
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Show all versions toggle - only show if more than 1 version */}
      {videos.length > 1 && (
        <div className="flex items-center justify-between pb-2 border-b">
          <span className="text-sm text-muted-foreground">
            {expandedVersions.size === videos.length
              ? `Showing all ${videos.length} versions`
              : `${videos.length - expandedVersions.size} older ${videos.length - expandedVersions.size === 1 ? 'version' : 'versions'} collapsed`
            }
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShowAllVersions}
            className="text-xs"
          >
            {showAllVersions ? (
              <>
                <EyeOff className="w-3 h-3 mr-1" />
                Collapse older
              </>
            ) : (
              <>
                <Eye className="w-3 h-3 mr-1" />
                Show all {videos.length} versions
              </>
            )}
          </Button>
        </div>
      )}

      {sortedVideos.map((video) => {
        const isExpanded = expandedVersions.has(video.id)
        const isLatest = video.id === latestVideoId

        if (isExpanded) {
          return renderExpandedVersion(video, isLatest)
        } else {
          return renderCollapsedVersion(video)
        }
      })}

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
