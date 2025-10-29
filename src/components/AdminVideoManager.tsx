'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ChevronDown, ChevronUp, Plus, Video, CheckCircle2 } from 'lucide-react'
import VideoUpload from './VideoUpload'
import VideoList from './VideoList'
import { cn } from '@/lib/utils'

interface VideoGroup {
  name: string
  videos: any[]
}

interface AdminVideoManagerProps {
  projectId: string
  videos: any[]
  projectStatus: string
  comments?: any[]
  restrictToLatestVersion?: boolean
  companyName?: string
  onVideoSelect?: (videoName: string, videos: any[]) => void
  onRefresh?: () => void
}

export default function AdminVideoManager({
  projectId,
  videos,
  projectStatus,
  comments = [],
  restrictToLatestVersion = false,
  companyName = 'Studio',
  onVideoSelect,
  onRefresh
}: AdminVideoManagerProps) {
  // Group videos by name
  const videoGroups = videos.reduce((acc: Record<string, any[]>, video) => {
    const name = video.name
    if (!acc[name]) {
      acc[name] = []
    }
    acc[name].push(video)
    return acc
  }, {})

  const hasVideos = videos.length > 0
  // Only allow one video expanded at a time - default to first video
  const [expandedGroup, setExpandedGroup] = useState<string | null>(
    Object.keys(videoGroups)[0] || null
  )
  const [showNewVideoForm, setShowNewVideoForm] = useState(!hasVideos) // Auto-show if no videos
  const [newVideoName, setNewVideoName] = useState('')

  // Notify parent when component mounts with first video
  useEffect(() => {
    const firstVideoName = Object.keys(videoGroups)[0]
    if (firstVideoName && onVideoSelect && videoGroups[firstVideoName]) {
      onVideoSelect(firstVideoName, videoGroups[firstVideoName])
    }
  }, []) // Run only once on mount

  const toggleGroup = (name: string) => {
    const wasExpanded = expandedGroup === name

    if (wasExpanded) {
      // Collapse current video
      setExpandedGroup(null)
    } else {
      // Expand this video (and collapse any other)
      setExpandedGroup(name)
      // Notify parent when expanding a video
      if (onVideoSelect && videoGroups[name]) {
        onVideoSelect(name, videoGroups[name])
      }
    }
  }

  const handleAddNewVideo = () => {
    if (newVideoName.trim()) {
      setExpandedGroup(newVideoName)
      setShowNewVideoForm(false)
      setNewVideoName('')
    }
  }

  const handleUploadComplete = () => {
    // Reset the "Add New Video" form when upload completes
    setShowNewVideoForm(false)
    setNewVideoName('')
    // Refresh the project data to show the new video
    onRefresh?.()
  }

  const sortedGroupNames = Object.keys(videoGroups).sort()

  // Check if any videos are processing
  const hasProcessingVideos = videos.some(
    v => v.status === 'PROCESSING' || v.status === 'UPLOADING'
  )

  return (
    <div className="space-y-4">
      {hasProcessingVideos && (
        <div className="bg-primary-visible border-2 border-primary-visible text-primary rounded-lg p-4 flex items-center gap-3 animate-pulse">
          <div className="relative flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
          <div className="flex-1">
            <p className="font-medium">Video processing in progress</p>
          </div>
        </div>
      )}
      {sortedGroupNames.map((groupName) => {
        const groupVideos = videoGroups[groupName]
        const isExpanded = expandedGroup === groupName
        const latestVideo = groupVideos.sort((a, b) => b.version - a.version)[0]
        const approvedCount = groupVideos.filter(v => v.approved).length
        const hasApprovedVideos = approvedCount > 0

        return (
          <Card key={groupName} className="overflow-hidden">
            <CardHeader
              className={cn(
                'cursor-pointer hover:bg-accent/50 transition-colors',
                'flex flex-row items-center justify-between space-y-0 py-4'
              )}
              onClick={() => toggleGroup(groupName)}
            >
              <div className="flex items-center gap-3 flex-1">
                <Video className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{groupName}</CardTitle>
                    {hasApprovedVideos && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-success-visible text-success border border-success-visible">
                        <CheckCircle2 className="w-3 h-3" />
                        {approvedCount} Approved
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {groupVideos.length} {groupVideos.length === 1 ? 'version' : 'versions'} •
                    Latest: v{latestVideo.version}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0 space-y-6 border-t border-border">
                {/* Upload new version for this video */}
                {projectStatus !== 'APPROVED' && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-3">Upload New Version</h4>
                    <VideoUpload
                      projectId={projectId}
                      videoName={groupName}
                      onUploadComplete={handleUploadComplete}
                    />
                  </div>
                )}

                {/* Version list */}
                <div>
                  <h4 className="text-sm font-medium mb-3">All Versions</h4>
                  <VideoList videos={groupVideos} />
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}

      {/* Add new video button */}
      {projectStatus !== 'APPROVED' && (
        <div>
          {!showNewVideoForm ? (
            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowNewVideoForm(true)}
              className="w-full border-dashed"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Video
            </Button>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Add New Video</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="videoName">Video Name *</Label>
                  <Input
                    id="videoName"
                    value={newVideoName}
                    onChange={(e) => setNewVideoName(e.target.value)}
                    placeholder="e.g., Introduction, Tutorial, Demo"
                    autoFocus
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Give this video a descriptive name
                  </p>
                </div>

                {newVideoName.trim() ? (
                  <VideoUpload
                    projectId={projectId}
                    videoName={newVideoName.trim()}
                    onUploadComplete={handleUploadComplete}
                  />
                ) : (
                  <div className="p-4 border-2 border-dashed border-border rounded-lg text-center text-sm text-muted-foreground">
                    Enter a video name to start uploading
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowNewVideoForm(false)
                      setNewVideoName('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
