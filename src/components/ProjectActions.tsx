'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Project } from '@prisma/client'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Trash2, ExternalLink, Archive, RotateCcw, Send, Loader2 } from 'lucide-react'
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

interface Video {
  id: string
  name: string
  versionLabel: string
  status: string
}

interface ProjectActionsProps {
  project: Project
  videos: Video[]
  onRefresh?: () => void
}

export default function ProjectActions({ project, videos, onRefresh }: ProjectActionsProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isTogglingApproval, setIsTogglingApproval] = useState(false)

  // Notification modal state
  const [showNotificationModal, setShowNotificationModal] = useState(false)
  const [notificationType, setNotificationType] = useState<'entire-project' | 'specific-video'>('entire-project')
  const [selectedVideoName, setSelectedVideoName] = useState<string>('')
  const [selectedVideoId, setSelectedVideoId] = useState<string>('')
  const [sendPasswordSeparately, setSendPasswordSeparately] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Check if project is password protected
  const isPasswordProtected = (project as any).sharePassword !== null &&
                               (project as any).sharePassword !== undefined &&
                               (project as any).sharePassword !== ''

  // Filter only ready videos
  const readyVideos = videos.filter(v => v.status === 'READY')

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
    // Validation
    if (notificationType === 'specific-video' && !selectedVideoId) {
      setMessage({ type: 'error', text: 'Please select a video and version' })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/projects/${project.id}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: notificationType === 'specific-video' ? selectedVideoId : null,
          notifyEntireProject: notificationType === 'entire-project',
          sendPasswordSeparately: isPasswordProtected && sendPasswordSeparately
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: data.message || 'Notification sent successfully!' })
        setSelectedVideoName('')
        setSelectedVideoId('')
        setSendPasswordSeparately(false)
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to send notification' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to send notification' })
    } finally {
      setLoading(false)
    }
  }

  const handleViewSharePage = () => {
    const shareUrl = `/share/${project.slug}`
    window.open(shareUrl, '_blank')
  }

  const handleToggleApproval = async () => {
    const isCurrentlyApproved = project.status === 'APPROVED'
    const action = isCurrentlyApproved ? 'unapprove' : 'approve'

    if (isCurrentlyApproved) {
      // Unapproving - this will unapprove ALL videos in the project
      if (!confirm(
        'Are you sure you want to unapprove this project?\n\n' +
        'This will unapprove ALL videos in the project, removing access to original quality downloads.'
      )) {
        return
      }
    } else {
      if (!confirm(`Are you sure you want to approve this project?`)) {
        return
      }
    }

    setIsTogglingApproval(true)
    try {
      let response

      if (isCurrentlyApproved) {
        // Use the dedicated unapprove endpoint that handles all videos
        response = await fetch(`/api/projects/${project.id}/unapprove`, {
          method: 'POST'
        })
      } else {
        // For approval, use the existing PATCH endpoint
        response = await fetch(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'APPROVED' })
        })
      }

      if (!response.ok) {
        throw new Error(`Failed to ${action} project`)
      }

      const data = await response.json()

      // Refresh project data
      await onRefresh?.()
      router.refresh()

      if (isCurrentlyApproved && data.unapprovedCount) {
        alert(`Project unapproved successfully. ${data.unapprovedCount} video(s) were unapproved.`)
      } else {
        alert(`Project ${action}d successfully`)
      }
    } catch (error) {
      alert(`Failed to ${action} project`)
    } finally {
      setIsTogglingApproval(false)
    }
  }

  const handleDelete = async () => {
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
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete project')
      }

      // Redirect to admin page after successful deletion
      router.push('/admin')
      router.refresh()
    } catch (error) {
      alert('Failed to delete project')
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Send Notification Button - only show if there are ready videos */}
          {readyVideos.length > 0 && (
            <Button
              variant="outline"
              size="default"
              className="w-full"
              onClick={() => setShowNotificationModal(true)}
            >
              <Send className="w-4 h-4 mr-2" />
              Send Notification
            </Button>
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

          {/* Approve/Unapprove Toggle Button */}
          <Button
            variant="outline"
            size="default"
            className="w-full"
            onClick={handleToggleApproval}
            disabled={isTogglingApproval}
          >
            {project.status === 'APPROVED' ? (
              <>
                <RotateCcw className="w-4 h-4 mr-2" />
                {isTogglingApproval ? 'Unapproving...' : 'Unapprove Project'}
              </>
            ) : (
              <>
                <Archive className="w-4 h-4 mr-2" />
                {isTogglingApproval ? 'Approving...' : 'Approve Project'}
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
              <Send className="w-5 h-5" />
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
    </>
  )
}
