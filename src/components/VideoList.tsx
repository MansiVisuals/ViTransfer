'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Video } from '@prisma/client'
import { formatDuration, formatFileSize } from '@/lib/utils'
import { Progress } from './ui/progress'
import { Button } from './ui/button'
import { Trash2, CheckCircle2, XCircle } from 'lucide-react'

interface VideoListProps {
  videos: Video[]
  isAdmin?: boolean
  onRefresh?: () => void
}

export default function VideoList({ videos: initialVideos, isAdmin = true, onRefresh }: VideoListProps) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [videos, setVideos] = useState<Video[]>(initialVideos)

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
      // Fetch updated video data
      const videoIds = videos.map(v => v.id)
      fetch(`/api/videos/${videoIds[0]}`)
        .then(res => res.ok ? router.refresh() : null)
        .catch(() => router.refresh())
    }, 2000)

    return () => clearInterval(interval)
  }, [videos, router])

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
      const response = await fetch(`/api/videos/${videoId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete video')
      }

      await onRefresh?.()
      router.refresh()
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
      const response = await fetch(`/api/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: !currentlyApproved })
      })

      if (!response.ok) {
        throw new Error(`Failed to ${action} video`)
      }

      await onRefresh?.()
      router.refresh()
    } catch (error) {
      alert(`Failed to ${action} video`)
    } finally {
      setApprovingId(null)
    }
  }

  if (videos.length === 0) {
    return <p className="text-sm text-muted-foreground">No videos uploaded yet</p>
  }

  // Check if any videos are processing for the indicator
  const hasProcessingVideos = videos.some(
    v => v.status === 'PROCESSING' || v.status === 'UPLOADING'
  )

  return (
    <div className="space-y-4">
      {hasProcessingVideos && (
        <div className="bg-primary-visible border-2 border-primary-visible text-primary rounded-lg p-3 flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Processing videos...</p>
          </div>
        </div>
      )}
      {videos.map((video) => (
        <div key={video.id} className="border rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3">
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-medium break-words">{video.versionLabel}</h4>
                {(video as any).approved && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-success-visible text-success border border-success-visible whitespace-nowrap">
                    <CheckCircle2 className="w-3 h-3" />
                    Approved
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground break-all">{video.originalFileName}</p>
            </div>
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
          </div>

          {video.status === 'PROCESSING' && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Processing previews...</span>
                <span>{video.processingProgress.toFixed(0)}%</span>
              </div>
              <Progress value={video.processingProgress} />
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
        </div>
      ))}
    </div>
  )
}
