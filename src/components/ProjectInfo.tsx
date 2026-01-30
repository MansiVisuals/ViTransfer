'use client'

import { useState, useEffect } from 'react'
import { Video } from '@prisma/client'
import { Button } from './ui/button'
import { Download, Info, CheckCircle2, Keyboard } from 'lucide-react'
import { formatTimestamp, formatFileSize, formatDate } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { VideoAssetDownloadModal } from './VideoAssetDownloadModal'
import { getAccessToken } from '@/lib/token-store'
import { cn } from '@/lib/utils'

interface ProjectInfoProps {
  selectedVideo: Video & { name?: string; approved?: boolean; downloadUrl?: string; cleanPreview720Path?: string | null; cleanPreview1080Path?: string | null }
  displayLabel: string
  isVideoApproved: boolean
  projectId: string
  projectTitle?: string
  projectDescription?: string
  clientName?: string
  isPasswordProtected?: boolean
  watermarkEnabled?: boolean
  defaultQuality: '720p' | '1080p'
  onApprove?: () => Promise<void>
  isAdmin?: boolean
  clientCanApprove?: boolean
  isGuest?: boolean
  onDownload?: () => void
  hideDownloadButton?: boolean
  allowAssetDownload?: boolean
  shareToken?: string | null
  activeVideoName?: string
  className?: string
  usePreviewForApprovedPlayback?: boolean
}

export default function ProjectInfo({
  selectedVideo,
  displayLabel,
  isVideoApproved,
  projectId,
  projectTitle,
  projectDescription,
  clientName,
  isPasswordProtected,
  watermarkEnabled = true,
  defaultQuality,
  onApprove,
  isAdmin = false,
  clientCanApprove = true,
  isGuest = false,
  hideDownloadButton = false,
  allowAssetDownload = true,
  shareToken = null,
  activeVideoName,
  className,
  usePreviewForApprovedPlayback = false,
}: ProjectInfoProps) {
  const [showInfoDialog, setShowInfoDialog] = useState(false)
  const [showApprovalConfirm, setShowApprovalConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [hasAssets, setHasAssets] = useState(false)
  const [checkingAssets, setCheckingAssets] = useState(false)
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false)

  const buildAuthHeaders = (shareTokenOverride?: string | null) => {
    const headers: Record<string, string> = {}
    const token = shareTokenOverride || (isAdmin ? getAccessToken() : null)
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    return headers
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

  const handleDownload = async () => {
    const downloadUrl = (selectedVideo as any).downloadUrl
    if (!downloadUrl) {
      alert('Download is only available for approved projects')
      return
    }

    if (allowAssetDownload && !isGuest && !isAdmin) {
      setCheckingAssets(true)

      const authHeaders = buildAuthHeaders(shareToken)
      fetch(`/api/videos/${selectedVideo.id}/assets`, {
        headers: authHeaders,
      })
        .then(async (response) => {
          if (response.ok) {
            const data = await response.json()
            if (data.assets && data.assets.length > 0) {
              setHasAssets(true)
              setShowDownloadModal(true)
              setCheckingAssets(false)
              return true
            }
          }
          return false
        })
        .catch(() => {
          return false
        })
        .then((hasAssets) => {
          setCheckingAssets(false)
          if (!hasAssets) {
            triggerDownload(downloadUrl)
          }
        })
      return
    }

    triggerDownload(downloadUrl)
  }

  const handleApprove = async () => {
    setLoading(true)

    const authHeaders = buildAuthHeaders(shareToken)

    try {
      const response = await fetch(`/api/projects/${projectId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          selectedVideoId: selectedVideo.id,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to approve project')
      }

      // Store the current video group name in sessionStorage to restore after reload
      if (activeVideoName) {
        sessionStorage.setItem('approvedVideoName', activeVideoName)
      }

      // Reload the page to show updated approval status
      window.location.reload()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to approve project')
      setLoading(false)
      setShowApprovalConfirm(false)
    }
  }

  // Listen for shortcuts dialog open request from CommentSection
  useEffect(() => {
    const handleOpenShortcuts = () => {
      setShowShortcutsDialog(true)
    }

    window.addEventListener('openShortcutsDialog', handleOpenShortcuts)
    return () => {
      window.removeEventListener('openShortcutsDialog', handleOpenShortcuts)
    }
  }, [])

  return (
    <div className={cn(
      'rounded-lg p-4 text-card-foreground flex-shrink-0 bg-card',
      className
    )}>
      {/* Shortcuts Dialog */}
      <Dialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog}>
        <DialogContent className="bg-card border-border text-card-foreground max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Video playback controls
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Play / Pause</span>
              <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+Space</kbd>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Decrease Speed</span>
              <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+,</kbd>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Increase Speed</span>
              <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+.</kbd>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Reset Speed</span>
              <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+/</kbd>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Previous Frame</span>
              <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+J</kbd>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">Next Frame</span>
              <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+L</kbd>
            </div>
            <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
              Frame stepping pauses the video automatically. Speed range: 0.25x - 2.0x
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header: Name + Action Buttons in single row */}
      <div className="flex items-center justify-between gap-3">
        {/* Left: Video Name */}
        <h3 className="text-base font-bold text-foreground truncate min-w-0">{(selectedVideo as any).name}</h3>

        {/* Right: Action Buttons */}
        <div className="flex gap-2 flex-shrink-0">
          {/* Approve Button - Only show when not approved and approval is allowed */}
          {!isVideoApproved && onApprove && (isAdmin || clientCanApprove) && (
            <Button
              onClick={() => setShowApprovalConfirm(true)}
              variant="success"
              size="sm"
              title="Approve this video version"
            >
              <CheckCircle2 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Approve</span>
            </Button>
          )}

          {/* Info Dialog Button - Hide in guest mode */}
          {!isGuest && (
            <Dialog open={showInfoDialog} onOpenChange={setShowInfoDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" title="View video information">
                  <Info className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Info</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border text-card-foreground max-w-[95vw] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Video Information</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Project details and original file specifications
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-xs sm:text-sm">
                  {/* Project Info Section */}
                  {(projectTitle || clientName || projectDescription) && (
                    <div className="space-y-2 pb-3 border-b border-border">
                      {projectTitle && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground text-xs">Project</span>
                          <span className="font-medium">{projectTitle}</span>
                        </div>
                      )}
                      {clientName && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground text-xs">For</span>
                          <span className="font-medium">{isPasswordProtected ? clientName : 'Client'}</span>
                        </div>
                      )}
                      {projectDescription && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground text-xs">Description</span>
                          <span className="font-medium whitespace-pre-wrap">{projectDescription}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Original File Specs Section */}
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Original File Specs</p>
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs">Filename</span>
                      <span className="font-medium break-all">{selectedVideo.originalFileName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Resolution</span>
                      <span className="font-medium">{selectedVideo.width}x{selectedVideo.height}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Codec</span>
                      <span className="font-medium">{selectedVideo.codec || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-medium">{formatTimestamp(selectedVideo.duration)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">FPS</span>
                      <span className="font-medium">{selectedVideo.fps ? selectedVideo.fps.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">File Size</span>
                      <span className="font-medium">{formatFileSize(Number(selectedVideo.originalFileSize))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Upload Date</span>
                      <span className="font-medium">{formatDate(selectedVideo.createdAt)}</span>
                    </div>
                  </div>

                  {/* Playback Status */}
                  <div className="pt-3 border-t border-border">
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="text-muted-foreground">Playback Status</span>
                      <span className="font-medium break-words">
                        {isVideoApproved
                          ? usePreviewForApprovedPlayback
                            ? `Approved - Preview (${defaultQuality})`
                            : 'Approved - Original Quality'
                          : `Downscaled Preview (${defaultQuality})${watermarkEnabled ? ' with Watermark' : ''}`
                        }
                      </span>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Download Button - Only show when video is approved and not in guest mode */}
          {isVideoApproved && !isGuest && !hideDownloadButton && (
            <Button onClick={handleDownload} variant="default" size="sm" title="Download original quality video">
              <Download className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          )}
        </div>
      </div>

      {/* Approval Confirmation Modal */}
      <Dialog open={showApprovalConfirm} onOpenChange={setShowApprovalConfirm}>
        <DialogContent className="bg-card border-border text-card-foreground max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Video</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Confirm approval for this video version
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground">Video:</span>
                <span className="font-medium">{(selectedVideo as any).name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground">Version:</span>
                <span className="font-medium">{selectedVideo.versionLabel}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Once approved, the original quality video will be available for download.
            </p>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleApprove}
                disabled={loading}
                variant="success"
                size="default"
                className="flex-1 font-semibold"
              >
                {loading ? 'Approving...' : 'Approve'}
              </Button>
              <Button
                onClick={() => setShowApprovalConfirm(false)}
                variant="outline"
                disabled={loading}
                size="default"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Download Modal - Only for clients with assets */}
      {showDownloadModal && hasAssets && (
        <VideoAssetDownloadModal
          videoId={selectedVideo.id}
          videoName={(selectedVideo as any).name || ''}
          versionLabel={selectedVideo.versionLabel}
          isOpen={showDownloadModal}
          onClose={() => setShowDownloadModal(false)}
          shareToken={shareToken}
          isAdmin={isAdmin}
        />
      )}
    </div>
  )
}
