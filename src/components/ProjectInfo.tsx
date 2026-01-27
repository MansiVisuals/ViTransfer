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
      `rounded-lg p-4 text-card-foreground flex-shrink-0 ${!isVideoApproved ? 'bg-accent/50 border-2 border-primary/20' : 'bg-card border border-border'}`,
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

      {/* Header: Version + Action Buttons, then Filename below */}
      <div className="space-y-3 mb-3 pb-3 border-b border-border">
        {/* Top row: Approved Badge + Version Label + Action Buttons */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {isVideoApproved && (
              <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
            )}
            <span className="text-base font-semibold text-foreground whitespace-nowrap">{displayLabel}</span>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {/* Info Dialog Button - Hide in guest mode */}
            {!isGuest && (
              <Dialog open={showInfoDialog} onOpenChange={setShowInfoDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Info className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">Info</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border text-card-foreground max-w-[95vw] sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Video Information</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      Detailed metadata for the original video
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 text-xs sm:text-sm">
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground">Filename:</span>
                      <span className="font-medium break-all text-xs sm:text-sm">{selectedVideo.originalFileName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Resolution:</span>
                      <span className="font-medium">{selectedVideo.width}x{selectedVideo.height}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Codec:</span>
                      <span className="font-medium">{selectedVideo.codec || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="font-medium">{formatTimestamp(selectedVideo.duration)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">FPS:</span>
                      <span className="font-medium">{selectedVideo.fps ? selectedVideo.fps.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">File Size:</span>
                      <span className="font-medium">{formatFileSize(Number(selectedVideo.originalFileSize))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Upload Date:</span>
                      <span className="font-medium">{formatDate(selectedVideo.createdAt)}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="text-muted-foreground">Status:</span>
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
                </DialogContent>
              </Dialog>
            )}

            {/* Download Button - Only show when video is approved and not in guest mode */}
            {isVideoApproved && !isGuest && !hideDownloadButton && (
              <Button onClick={handleDownload} variant="default" size="sm">
                <Download className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Download</span>
              </Button>
            )}
          </div>
        </div>

        {/* Bottom row: Filename */}
        <div>
          <h3 className="text-lg font-bold text-foreground break-words">{(selectedVideo as any).name}</h3>
        </div>
      </div>

      {/* Information Grid - Compact 2 column layout */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {/* Project */}
        {projectTitle && (
          <div className="col-span-2">
            <span className="text-xs text-muted-foreground">Project:</span>
            <span className="ml-2 font-medium text-foreground">{projectTitle}</span>
          </div>
        )}

        {/* For (Client) */}
        {clientName && (
          <div className="col-span-2">
            <span className="text-xs text-muted-foreground">For:</span>
            <span className="ml-2 font-medium text-foreground">{isPasswordProtected ? clientName : 'Client'}</span>
          </div>
        )}

        {/* Description */}
        {projectDescription && (
          <div className="col-span-2">
            <span className="text-xs text-muted-foreground">Description:</span>
            <span className="ml-2 text-foreground whitespace-pre-wrap">{projectDescription}</span>
          </div>
        )}
      </div>

      {/* Note & Approval Section (only if video not approved and approval is allowed) */}
      {!isVideoApproved && onApprove && (isAdmin || clientCanApprove) && (
        <>
          <div className="text-xs text-muted-foreground pt-3 mt-3 border-t border-border">
            <span className="font-medium text-foreground">Note:</span> This is a downscaled preview{watermarkEnabled && ' with watermark'}. Original quality will be available for download once approved.
          </div>

          <div className="pt-2 mt-2">
            {!showApprovalConfirm ? (
              <Button
                onClick={() => setShowApprovalConfirm(true)}
                variant="success"
                size="default"
                className="w-full"
              >
                Approve this video as final
              </Button>
            ) : (
              <div className="space-y-4 bg-primary/10 border-2 border-primary rounded-lg p-4">
                <div className="text-center space-y-2">
                  <p className="text-base text-foreground font-bold">
                    Approve this video?
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Video: <span className="font-semibold text-foreground">{(selectedVideo as any).name}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Version: <span className="font-semibold text-foreground">{selectedVideo.versionLabel}</span>
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleApprove}
                    disabled={loading}
                    variant="success"
                    size="default"
                    className="flex-1 font-semibold"
                  >
                    {loading ? 'Approving...' : 'Yes, Approve This Video'}
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
            )}
          </div>
        </>
      )}

      {/* Approved Status */}
      {isVideoApproved && (
        <div className="flex items-center gap-2 text-sm text-success pt-3 mt-3 border-t border-border">
          <CheckCircle2 className="w-4 h-4" />
          <span className="font-medium">
            {selectedVideo.versionLabel} approved - Download available
          </span>
        </div>
      )}

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
