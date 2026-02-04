'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Project } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Trash2, ExternalLink, Archive, ArchiveRestore, RotateCcw, Send, Loader2, CheckCircle, BarChart3, FolderKanban, Copy, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { UnapproveModal } from './UnapproveModal'
import { apiPost, apiPatch, apiDelete } from '@/lib/api-client'

interface Video {
  id: string
  name: string
  versionLabel: string
  status: string
  approved: boolean
}

interface ProjectActionsProps {
  project: Project
  videos: Video[]
  onRefresh?: () => void
  shareUrl?: string
  recipients?: any[]
}

export default function ProjectActions({ project, videos, onRefresh, shareUrl = '', recipients = [] }: ProjectActionsProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTogglingApproval, setIsTogglingApproval] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  // Unapprove modal state
  const [showUnapproveModal, setShowUnapproveModal] = useState(false)

  // Notification modal state
  const [showNotificationModal, setShowNotificationModal] = useState(false)
  const [notificationType, setNotificationType] = useState<'entire-project' | 'specific-video'>('entire-project')
  const [selectedVideoName, setSelectedVideoName] = useState<string>('')
  const [selectedVideoId, setSelectedVideoId] = useState<string>('')
  const [sendPasswordSeparately, setSendPasswordSeparately] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Read SMTP configuration status from project data
  const smtpConfigured = (project as any).smtpConfigured !== false

  // Check if at least one recipient has an email address
  const hasRecipientWithEmail = (project as any).recipients?.some((r: any) => r.email && r.email.trim() !== '') || false

  // Check if project is password protected
  const isPasswordProtected = (project as any).sharePassword !== null &&
                               (project as any).sharePassword !== undefined &&
                               (project as any).sharePassword !== ''

  // Filter only ready videos
  const readyVideos = videos.filter(v => v.status === 'READY')

  // Check if all unique videos have at least one approved version
  const videosByNameForApproval = readyVideos.reduce((acc, video) => {
    if (!acc[video.name]) {
      acc[video.name] = []
    }
    acc[video.name].push(video)
    return acc
  }, {} as Record<string, Video[]>)

  const allVideosHaveApprovedVersion = Object.values(videosByNameForApproval).every((versions: Video[]) =>
    versions.some(v => v.approved)
  )

  const canApproveProject = readyVideos.length > 0 && allVideosHaveApprovedVersion

  // Group videos by name
  const videosByName = readyVideos.reduce((acc, video) => {
    if (!acc[video.name]) {
      acc[video.name] = []
    }
    acc[video.name].push(video)
    return acc
  }, {} as Record<string, Video[]>)

  const videoNames = Object.keys(videosByName)
  const versionsForSelectedVideo = selectedVideoName ? videosByName[selectedVideoName] : []

  // Reset selections when notification type changes
  const handleNotificationTypeChange = (type: 'entire-project' | 'specific-video') => {
    setNotificationType(type)
    setSelectedVideoName('')
    setSelectedVideoId('')
  }

  // Reset version selection when video name changes
  const handleVideoNameChange = (name: string) => {
    setSelectedVideoName(name)
    setSelectedVideoId('')
  }

  const handleSendNotification = async () => {
    // Prevent rapid-fire notification sends
    if (loading) return

    // Validation
    if (notificationType === 'specific-video' && !selectedVideoId) {
      setMessage({ type: 'error', text: 'Please select a video and version' })
      return
    }

    setLoading(true)
    setMessage({ type: 'success', text: 'Sending notification...' })

    // Send notification in background without blocking UI
    apiPost(`/api/projects/${project.id}/notify`, {
      videoId: notificationType === 'specific-video' ? selectedVideoId : null,
      notifyEntireProject: notificationType === 'entire-project',
      sendPasswordSeparately: isPasswordProtected && sendPasswordSeparately
    })
      .then((data) => {
        setMessage({ type: 'success', text: data.message || 'Notification sent successfully!' })
        setSelectedVideoName('')
        setSelectedVideoId('')
        setSendPasswordSeparately(false)
      })
      .catch((error) => {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to send notification' })
      })
      .finally(() => {
        setLoading(false)
      })
  }

  const handleViewSharePage = () => {
    router.push(`/admin/projects/${project.id}/share`)
  }

  const handleToggleApproval = async () => {
    // Prevent double-clicks during approval toggle
    if (isTogglingApproval) return

    const isCurrentlyApproved = project.status === 'APPROVED'

    if (isCurrentlyApproved) {
      // Show the unapprove modal to let user choose
      setShowUnapproveModal(true)
    } else {
      // For approval, just confirm and proceed
      if (!confirm(`Are you sure you want to approve this project?`)) {
        return
      }

      setIsTogglingApproval(true)

      // Approve project in background without blocking UI
      apiPatch(`/api/projects/${project.id}`, { status: 'APPROVED' })
        .then(() => {
          alert('Project approved successfully')
          // Refresh in background
          onRefresh?.()
          router.refresh()
        })
        .catch((error) => {
          alert('Failed to approve project')
        })
        .finally(() => {
          setIsTogglingApproval(false)
        })
    }
  }

  const handleUnapprove = async (unapproveVideos: boolean) => {
    // Prevent double-clicks during unapproval
    if (isTogglingApproval) return

    setIsTogglingApproval(true)
    setShowUnapproveModal(false)

    // Unapprove project in background without blocking UI
    apiPost(`/api/projects/${project.id}/unapprove`, { unapproveVideos })
      .then((data) => {
        // Show appropriate success message
        if (data.unapprovedVideos && data.unapprovedCount > 0) {
          alert(`Project unapproved successfully. ${data.unapprovedCount} video(s) were also unapproved.`)
        } else if (data.unapprovedVideos && data.unapprovedCount === 0) {
          alert('Project unapproved successfully. No videos were approved.')
        } else {
          alert('Project unapproved successfully. Videos remain approved.')
        }
        // Refresh in background
        onRefresh?.()
        router.refresh()
      })
      .catch((error) => {
        alert('Failed to unapprove project')
      })
      .finally(() => {
        setIsTogglingApproval(false)
      })
  }

  const handleUnapproveProjectOnly = () => {
    handleUnapprove(false)
  }

  const handleUnapproveAll = () => {
    handleUnapprove(true)
  }

  const handleCancelUnapprove = () => {
    setShowUnapproveModal(false)
  }

  const handleDelete = async () => {
    // Prevent double-clicks during deletion
    if (isDeleting) return

    if (!confirm(
      'Are you sure you want to delete this project? This will permanently delete all videos and files. This action cannot be undone.'
    )) {
      return
    }

    // Double confirmation for safety
    if (!confirm('This is your last warning. Delete permanently?')) {
      return
    }

    setIsDeleting(true)

    // Delete project in background without blocking UI
    apiDelete(`/api/projects/${project.id}`)
      .then(() => {
        // Redirect to admin page after successful deletion
        router.push('/admin/projects')
        router.refresh()
      })
      .catch((error) => {
        alert('Failed to delete project')
        setIsDeleting(false)
      })
  }

  const handleToggleArchive = async () => {
    if (isArchiving) return

    const isCurrentlyArchived = project.status === 'ARCHIVED'
    const action = isCurrentlyArchived ? 'unarchive' : 'archive'
    const newStatus = isCurrentlyArchived ? 'IN_REVIEW' : 'ARCHIVED'

    if (!confirm(`Are you sure you want to ${action} this project?${!isCurrentlyArchived ? ' The share link will become inaccessible to clients.' : ''}`)) {
      return
    }

    setIsArchiving(true)

    apiPatch(`/api/projects/${project.id}`, { status: newStatus })
      .then(() => {
        alert(`Project ${action}d successfully`)
        onRefresh?.()
        router.refresh()
      })
      .catch(() => {
        alert(`Failed to ${action} project`)
      })
      .finally(() => {
        setIsArchiving(false)
      })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2 break-words mb-2">
                <span className="rounded-md p-1.5 flex-shrink-0 bg-foreground/5 dark:bg-foreground/10">
                  <FolderKanban className="w-4 h-4 text-primary" />
                </span>
                <span className="min-w-0 break-words">{project.title}</span>
              </CardTitle>
              <p className="text-sm text-muted-foreground break-words">{(project as any).description}</p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${
                project.status === 'APPROVED'
                  ? 'bg-success-visible text-success border-2 border-success-visible'
                  : project.status === 'SHARE_ONLY'
                  ? 'bg-info-visible text-info border-2 border-info-visible'
                  : project.status === 'IN_REVIEW'
                  ? 'bg-primary-visible text-primary border-2 border-primary-visible'
                  : 'bg-muted text-muted-foreground border border-border'
              }`}
            >
              {project.status.replace('_', ' ')}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Client Information */}
          <div className="pb-3 border-b border-border">
            <div className="text-sm">
              <p className="text-muted-foreground mb-1">Client</p>
              {(() => {
                const clientCompany = (project as any).companyName
                const primaryRecipient = recipients?.find((r: any) => r.isPrimary) || recipients?.[0]
                const clientName = primaryRecipient?.name
                const clientEmail = primaryRecipient?.email

                return (
                  <>
                    {clientCompany && (
                      <p className="font-medium break-words">{clientCompany}</p>
                    )}
                    {clientName && (
                      <p className={clientCompany ? "text-muted-foreground break-words" : "font-medium break-words"}>
                        {clientName}
                      </p>
                    )}
                    {clientEmail && (
                      <p className="text-xs text-muted-foreground break-all">
                        {clientEmail}
                      </p>
                    )}
                    {!clientCompany && !clientName && !clientEmail && (
                      <p className="font-medium">No client info</p>
                    )}
                  </>
                )
              })()}
            </div>
          </div>

          {/* Share Link */}
          {shareUrl && (
            <div className="pb-3 border-b border-border">
              <p className="text-sm text-muted-foreground mb-2">Share Link</p>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 px-3 py-2 border rounded-md text-xs bg-muted truncate"
                />
                <div className="flex gap-2">
                  <Button 
                    onClick={() => {
                      navigator.clipboard.writeText(shareUrl)
                      setLinkCopied(true)
                      setTimeout(() => setLinkCopied(false), 2000)
                    }} 
                    variant="outline" 
                    size="sm"
                    className="flex-1"
                  >
                    {linkCopied ? (
                      <>
                        <Check className="w-4 h-4 mr-2 text-success" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Actions Section Title */}
          <div className="pt-2">
            <h3 className="text-sm font-semibold mb-3">Project Actions</h3>
          </div>

          {/* Send Notification Button - only show if there are ready videos */}
          {readyVideos.length > 0 && (
            <div>
              <Button
                variant="outline"
                size="default"
                className="w-full"
                onClick={() => setShowNotificationModal(true)}
                disabled={smtpConfigured === false || !hasRecipientWithEmail}
                title={
                  smtpConfigured === false
                    ? 'SMTP not configured. Please configure email settings in Settings.'
                    : !hasRecipientWithEmail
                    ? 'No recipients with email addresses configured. Please add at least one recipient with an email in Settings.'
                    : ''
                }
              >
                <Send className="w-4 h-4 mr-2" />
                Send Notification
              </Button>
              {smtpConfigured === false && (
                <p className="text-xs text-muted-foreground mt-1 px-1">
                  Configure SMTP in Settings to enable email notifications
                </p>
              )}
              {smtpConfigured && !hasRecipientWithEmail && (
                <p className="text-xs text-muted-foreground mt-1 px-1">
                  Add at least one recipient with an email address in Settings
                </p>
              )}
            </div>
          )}

          <Button
            variant="outline"
            size="default"
            className="w-full"
            onClick={handleViewSharePage}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            View Share Page
          </Button>

          <Button
            variant="outline"
            size="default"
            className="w-full"
            onClick={() => router.push(`/admin/projects/${project.id}/analytics`)}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            View Analytics
          </Button>

          {/* Approve/Unapprove Toggle Button - hidden when archived */}
          {project.status !== 'ARCHIVED' && (
            <div>
              <Button
                variant="outline"
                size="default"
                className="w-full"
                onClick={handleToggleApproval}
                disabled={isTogglingApproval || (project.status !== 'APPROVED' && !canApproveProject)}
                title={
                  project.status !== 'APPROVED' && !canApproveProject
                    ? 'Approve one version of each video first'
                    : ''
                }
              >
                {project.status === 'APPROVED' ? (
                  <>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {isTogglingApproval ? 'Unapproving...' : 'Unapprove Project'}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {isTogglingApproval ? 'Approving...' : 'Approve Project'}
                  </>
                )}
              </Button>
              {project.status !== 'APPROVED' && !canApproveProject && (
                <p className="text-xs text-muted-foreground mt-1 px-1">
                  Approve one version of each video to enable project approval
                </p>
              )}
            </div>
          )}

          <Button
            variant="outline"
            size="default"
            className="w-full"
            onClick={handleToggleArchive}
            disabled={isArchiving}
          >
            {project.status === 'ARCHIVED' ? (
              <>
                <ArchiveRestore className="w-4 h-4 mr-2" />
                {isArchiving ? 'Unarchiving...' : 'Unarchive Project'}
              </>
            ) : (
              <>
                <Archive className="w-4 h-4 mr-2" />
                {isArchiving ? 'Archiving...' : 'Archive Project'}
              </>
            )}
          </Button>

          <Button
            variant="destructive"
            size="default"
            className="w-full"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {isDeleting ? 'Deleting...' : 'Delete Project'}
          </Button>
        </CardContent>
      </Card>

      {/* Notification Modal */}
      <Dialog open={showNotificationModal} onOpenChange={setShowNotificationModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Send Notification
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Notification Type Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Notification Type
              </label>
              <Select value={notificationType} onValueChange={handleNotificationTypeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entire-project">
                    Entire Project (All Ready Videos)
                  </SelectItem>
                  <SelectItem value="specific-video">
                    Specific Video & Version
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Show video/version selectors only for specific video notification */}
            {notificationType === 'specific-video' && (
              <>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Select Video
                  </label>
                  <Select value={selectedVideoName} onValueChange={handleVideoNameChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a video..." />
                    </SelectTrigger>
                    <SelectContent>
                      {videoNames.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedVideoName && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Select Version
                    </label>
                    <Select value={selectedVideoId} onValueChange={setSelectedVideoId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a version..." />
                      </SelectTrigger>
                      <SelectContent>
                        {versionsForSelectedVideo.map((video) => (
                          <SelectItem key={video.id} value={video.id}>
                            {video.versionLabel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {/* Password checkbox - only show if project is password protected */}
            {isPasswordProtected && (
              <div className="flex items-center space-x-2 p-3 bg-muted rounded-md">
                <input
                  type="checkbox"
                  id="send-password"
                  checked={sendPasswordSeparately}
                  onChange={(e) => setSendPasswordSeparately(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <label
                  htmlFor="send-password"
                  className="text-sm font-medium cursor-pointer"
                >
                  Send password in separate email
                </label>
              </div>
            )}

            {isPasswordProtected && (
              <p className="text-xs text-muted-foreground bg-accent/50 p-3 rounded-md border border-border">
                <strong>Note:</strong> This project is password protected. {sendPasswordSeparately ? 'The password will be sent in a separate email for enhanced security.' : 'The password will NOT be included in the email - you must share it separately.'}
              </p>
            )}

            <Button
              onClick={handleSendNotification}
              disabled={loading || (notificationType === 'specific-video' && !selectedVideoId)}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Email Notification
                </>
              )}
            </Button>

            {message && (
              <div
                className={`p-3 rounded-md text-sm font-medium ${
                  message.type === 'success'
                    ? 'bg-success-visible text-success border-2 border-success-visible'
                    : 'bg-destructive-visible text-destructive border-2 border-destructive-visible'
                }`}
              >
                {message.text}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {notificationType === 'entire-project'
                ? 'This will send an email to the client with access to all ready videos in this project.'
                : 'This will send an email to the client with a link to view the selected video version.'}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unapprove Modal */}
      <UnapproveModal
        show={showUnapproveModal}
        onCancel={handleCancelUnapprove}
        onUnapproveProjectOnly={handleUnapproveProjectOnly}
        onUnapproveAll={handleUnapproveAll}
        processing={isTogglingApproval}
      />
    </>
  )
}
