'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
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
  authenticatedEmail?: string | null
  authenticatedName?: string | null
  className?: string
  usePreviewForApprovedPlayback?: boolean
}

export default function ProjectInfo({
  selectedVideo,
  displayLabel: _displayLabel,
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
  authenticatedEmail = null,
  authenticatedName = null,
  className,
  usePreviewForApprovedPlayback = false,
}: ProjectInfoProps) {
  const [showInfoDialog, setShowInfoDialog] = useState(false)
  const [showApprovalConfirm, setShowApprovalConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [hasAssets, setHasAssets] = useState(false)
  const [_checkingAssets, setCheckingAssets] = useState(false)
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false)

  const t = useTranslations('videos')
  const tc = useTranslations('common')

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
      alert(t('downloadApprovedOnly'))
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
          authorName: authenticatedName || undefined,
          authorEmail: authenticatedEmail || undefined,
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
      alert(error instanceof Error ? error.message : t('failedToApproveVideo'))
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
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="w-5 h-5 text-primary" />
              {t('keyboardShortcuts')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('videoPlaybackControls')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">{t('playPause')}</span>
              <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+Space</kbd>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">{t('decreaseSpeed')}</span>
              <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+,</kbd>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">{t('increaseSpeed')}</span>
              <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+.</kbd>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">{t('resetSpeed')}</span>
              <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+/</kbd>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">{t('previousFrame')}</span>
              <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+J</kbd>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">{t('nextFrame')}</span>
              <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">Ctrl+L</kbd>
            </div>
            <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
              {t('frameSteppingHint')}
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
              data-tutorial="approve-btn"
              onClick={() => setShowApprovalConfirm(true)}
              variant="success"
              size="sm"
              title={t('approveVideoVersion')}
            >
              <CheckCircle2 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('approve')}</span>
            </Button>
          )}

          {/* Info Dialog Button - Hide in guest mode */}
          {!isGuest && (
            <Dialog open={showInfoDialog} onOpenChange={setShowInfoDialog}>
              <DialogTrigger asChild>
                <Button data-tutorial="info-btn" variant="outline" size="sm" title={t('viewVideoInfo')}>
                  <Info className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('info')}</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border text-card-foreground max-w-[95vw] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Info className="w-5 h-5 text-primary" />
                    {t('videoInformation')}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    {t('videoInfoDescription')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-xs sm:text-sm">
                  {/* Project Info Section */}
                  {(projectTitle || clientName || projectDescription) && (
                    <div className="space-y-2 pb-3 border-b border-border">
                      {projectTitle && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground text-xs">{t('project')}</span>
                          <span className="font-medium">{projectTitle}</span>
                        </div>
                      )}
                      {clientName && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground text-xs">{t('forLabel')}</span>
                          <span className="font-medium">{isPasswordProtected ? clientName : t('clientLabel')}</span>
                        </div>
                      )}
                      {projectDescription && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground text-xs">{tc('description')}</span>
                          <span className="font-medium whitespace-pre-wrap">{projectDescription}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Original File Specs Section */}
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t('originalFileSpecs')}</p>
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs">{t('filename')}</span>
                      <span className="font-medium break-all">{selectedVideo.originalFileName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('resolution')}</span>
                      <span className="font-medium">{selectedVideo.width}x{selectedVideo.height}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('codec')}</span>
                      <span className="font-medium">{selectedVideo.codec || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('duration')}</span>
                      <span className="font-medium">{formatTimestamp(selectedVideo.duration)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('fps')}</span>
                      <span className="font-medium">{selectedVideo.fps ? selectedVideo.fps.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('fileSize')}</span>
                      <span className="font-medium">{formatFileSize(Number(selectedVideo.originalFileSize))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('uploadDate')}</span>
                      <span className="font-medium">{formatDate(selectedVideo.createdAt)}</span>
                    </div>
                  </div>

                  {/* Playback Status */}
                  <div className="pt-3 border-t border-border">
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="text-muted-foreground">{t('playbackStatus')}</span>
                      <span className="font-medium break-words">
                        {(() => {
                          const hasPreview = !!(selectedVideo.preview720Path || selectedVideo.preview1080Path)
                          if (isVideoApproved) {
                            return usePreviewForApprovedPlayback
                              ? t('approvedPreview', { quality: defaultQuality })
                              : t('approvedOriginal')
                          }
                          if (!hasPreview) {
                            return t('originalQuality')
                          }
                          return t('downscaledPreview', { quality: defaultQuality, watermark: watermarkEnabled ? t('withWatermark') : '' })
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Download Button - Only show when video is approved and not in guest mode */}
          {isVideoApproved && !isGuest && !hideDownloadButton && (
            <Button data-tutorial="download-btn" onClick={handleDownload} variant="default" size="sm" title={t('downloadOriginal')}>
              <Download className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{tc('download')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Approval Confirmation Modal */}
      <Dialog open={showApprovalConfirm} onOpenChange={setShowApprovalConfirm}>
        <DialogContent className="bg-card border-border text-card-foreground max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              {t('approveVideo')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('confirmApprovalDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground">{t('videoLabel')}:</span>
                <span className="font-medium">{(selectedVideo as any).name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground">{tc('version')}:</span>
                <span className="font-medium">{selectedVideo.versionLabel}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('approvalDownloadHint')}
            </p>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleApprove}
                disabled={loading}
                variant="success"
                size="default"
                className="flex-1 font-semibold"
              >
                {loading ? t('approving') : t('approve')}
              </Button>
              <Button
                onClick={() => setShowApprovalConfirm(false)}
                variant="outline"
                disabled={loading}
                size="default"
              >
                {tc('cancel')}
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
