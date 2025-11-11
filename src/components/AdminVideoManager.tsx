'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ChevronDown, ChevronUp, Plus, Video, CheckCircle2, Pencil } from 'lucide-react'
import VideoUpload from './VideoUpload'
import VideoList from './VideoList'
import { InlineEdit } from './InlineEdit'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'

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
  sortMode?: 'status' | 'alphabetical'
}

export default function AdminVideoManager({
  projectId,
  videos,
  projectStatus,
  comments = [],
  restrictToLatestVersion = false,
  companyName = 'Studio',
  onVideoSelect,
  onRefresh,
  sortMode = 'status'
}: AdminVideoManagerProps) {
  const router = useRouter()

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
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null)
  const [editGroupValue, setEditGroupValue] = useState('')
  const [savingGroupName, setSavingGroupName] = useState<string | null>(null)

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

  const handleStartEditGroupName = (oldName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingGroupName(oldName)
    setEditGroupValue(oldName)
  }

  const handleCancelEditGroupName = () => {
    setEditingGroupName(null)
    setEditGroupValue('')
  }

  const handleSaveGroupName = async (oldName: string) => {
    if (!editGroupValue.trim()) {
      alert('Video name cannot be empty')
      return
    }

    setSavingGroupName(oldName)
    try {
      const videosInGroup = videoGroups[oldName]
      const videoIds = videosInGroup.map(v => v.id)

      // Single batch update for all videos
      const response = await fetch('/api/videos/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds, name: editGroupValue.trim() })
      })

      if (!response.ok) {
        throw new Error('Failed to update video name')
      }

      setEditingGroupName(null)
      setEditGroupValue('')
      await onRefresh?.()
      router.refresh()
    } catch (error) {
      alert('Failed to update video name')
    } finally {
      setSavingGroupName(null)
    }
  }

  const sortedGroupNames = Object.keys(videoGroups).sort((nameA, nameB) => {
    if (sortMode === 'alphabetical') {
      return nameA.localeCompare(nameB)
    } else {
      // Status sorting
      // Check if ANY version is approved in each group
      const hasApprovedA = videoGroups[nameA].some(v => v.approved)
      const hasApprovedB = videoGroups[nameB].some(v => v.approved)

      // Groups with no approved versions come first, groups with any approved versions come last
      if (hasApprovedA !== hasApprovedB) {
        return hasApprovedA ? 1 : -1
      }
      // If both have same approval status, sort alphabetically
      return nameA.localeCompare(nameB)
    }
  })

  return (
    <div className="space-y-4">
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
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Video className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {editingGroupName === groupName ? (
                      <InlineEdit
                        value={editGroupValue}
                        onChange={setEditGroupValue}
                        onSave={() => handleSaveGroupName(groupName)}
                        onCancel={handleCancelEditGroupName}
                        disabled={savingGroupName === groupName}
                        inputClassName="h-8 w-full sm:w-64"
                        stopPropagation={true}
                      />
                    ) : (
                      <>
                        <CardTitle className="text-lg">{groupName}</CardTitle>
                        {projectStatus !== 'APPROVED' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary-visible flex-shrink-0"
                            onClick={(e) => handleStartEditGroupName(groupName, e)}
                            title="Edit video name"
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                        )}
                        {hasApprovedVideos && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 ml-2 rounded text-xs font-medium bg-success-visible text-success border border-success-visible flex-shrink-0">
                            <CheckCircle2 className="w-3 h-3" />
                            {approvedCount} Approved
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {editingGroupName !== groupName && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {groupVideos.length} {groupVideos.length === 1 ? 'version' : 'versions'} •
                      Latest: v{latestVideo.version}
                    </p>
                  )}
                </div>
                {editingGroupName !== groupName && (
                  isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  )
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
                <div className="mt-6">
                  <h4 className="text-sm font-medium mb-3">All Versions</h4>
                  <VideoList
                    videos={groupVideos.sort((a, b) => {
                      if (sortMode === 'alphabetical') {
                        // Alphabetical by version label
                        return a.versionLabel.localeCompare(b.versionLabel)
                      } else {
                        // Status sorting: approved first, then by version descending
                        if (a.approved !== b.approved) {
                          return a.approved ? -1 : 1
                        }
                        return b.version - a.version
                      }
                    })}
                    onRefresh={onRefresh}
                  />
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
