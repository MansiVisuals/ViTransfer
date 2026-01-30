'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ChevronDown, ChevronUp, Plus, Video, CheckCircle2, Pencil, Upload, X } from 'lucide-react'
import VideoUpload from './VideoUpload'
import VideoList from './VideoList'
import { InlineEdit } from './InlineEdit'
import { cn, formatFileSize } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { apiPatch } from '@/lib/api-client'

interface VideoGroup {
  name: string
  videos: any[]
}

interface AdminVideoManagerProps {
  projectId: string
  videos: any[]
  projectStatus: string
  restrictToLatestVersion?: boolean
  companyName?: string
  onRefresh?: () => void
  sortMode?: 'status' | 'alphabetical'
  maxRevisions?: number
  enableRevisions?: boolean
}

export default function AdminVideoManager({
  projectId,
  videos,
  projectStatus,
  restrictToLatestVersion = false,
  companyName = 'Studio',
  onRefresh,
  sortMode = 'alphabetical',
  maxRevisions,
  enableRevisions
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
  // Only allow one video expanded at a time - default collapsed
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [pendingUploads, setPendingUploads] = useState<Array<{ id: string; file: File; videoName: string }>>([])
  const [isDragging, setIsDragging] = useState(false)
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null)
  const [editGroupValue, setEditGroupValue] = useState('')
  const [savingGroupName, setSavingGroupName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Extract video name from filename (remove extension)
  const getVideoNameFromFile = (file: File): string => {
    const name = file.name
    const lastDot = name.lastIndexOf('.')
    return lastDot > 0 ? name.substring(0, lastDot) : name
  }

  // Drag and drop handlers for quick video add
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (projectStatus !== 'APPROVED') {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (projectStatus === 'APPROVED') return

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'))
    if (files.length > 0) {
      const newUploads = files.map(file => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        videoName: getVideoNameFromFile(file)
      }))
      setPendingUploads(prev => [...prev, ...newUploads])
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('video/'))
    if (files.length > 0) {
      const newUploads = files.map(file => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        videoName: getVideoNameFromFile(file)
      }))
      setPendingUploads(prev => [...prev, ...newUploads])
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemovePendingUpload = (id: string) => {
    setPendingUploads(prev => prev.filter(u => u.id !== id))
  }

  const handleUploadCompleteForPending = (id: string) => {
    setPendingUploads(prev => prev.filter(u => u.id !== id))
    onRefresh?.()
  }

  const handleUpdateVideoName = (id: string, newName: string) => {
    setPendingUploads(prev => prev.map(u => u.id === id ? { ...u, videoName: newName } : u))
  }

  const toggleGroup = (name: string) => {
    const wasExpanded = expandedGroup === name

    if (wasExpanded) {
      // Collapse current video
      setExpandedGroup(null)
    } else {
      // Expand this video (and collapse any other)
      setExpandedGroup(name)
    }
  }

  const handleUploadComplete = () => {
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

    const videosInGroup = videoGroups[oldName]
    const videoIds = videosInGroup.map(v => v.id)

    // Single batch update for all videos (non-blocking)
    apiPatch('/api/videos/batch', { videoIds, name: editGroupValue.trim() })
      .then(() => {
        setEditingGroupName(null)
        setEditGroupValue('')
        // Refresh in background
        onRefresh?.()
        router.refresh()
      })
      .catch((error) => {
        alert('Failed to update video name')
      })
      .finally(() => {
        setSavingGroupName(null)
      })
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
    <div
      className="space-y-4"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input for click-to-upload (multiple) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Compact upload zone at top */}
      {projectStatus !== 'APPROVED' && (
        <div className="space-y-2">
          {/* Drop zone - compact */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg px-4 py-2.5 transition-all cursor-pointer flex items-center gap-3',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent/30'
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-5 h-5 text-muted-foreground shrink-0" />
            <p className="text-sm flex-1">
              {isDragging ? 'Drop videos here' : 'Drop videos or click to add'}
            </p>
            <Plus className="w-5 h-5 text-muted-foreground shrink-0" />
          </div>

          {/* Pending uploads queue */}
          {pendingUploads.length > 0 && (
            <div className="space-y-2">
              {pendingUploads.map((upload) => (
                <div key={upload.id} className="border rounded-lg p-3 bg-card">
                  <div className="flex items-start gap-3">
                    <Video className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={upload.videoName}
                          onChange={(e) => handleUpdateVideoName(upload.id, e.target.value)}
                          placeholder="Video name"
                          className="h-8 text-sm"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemovePendingUpload(upload.id)}
                          className="h-8 w-8 shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {upload.file.name} ({formatFileSize(upload.file.size)})
                      </p>
                      {upload.videoName.trim() && (
                        <VideoUpload
                          projectId={projectId}
                          videoName={upload.videoName.trim()}
                          onUploadComplete={() => handleUploadCompleteForPending(upload.id)}
                          initialFile={upload.file}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {sortedGroupNames.map((groupName) => {
        const groupVideos = videoGroups[groupName]
        const isExpanded = expandedGroup === groupName
        const latestVideo = groupVideos.sort((a, b) => b.version - a.version)[0]
        const approvedCount = groupVideos.filter(v => v.approved).length
        const hasApprovedVideos = approvedCount > 0
        const processingCount = groupVideos.filter(v => v.status === 'PROCESSING').length
        const hasProcessingVideos = processingCount > 0
        const errorCount = groupVideos.filter(v => v.status === 'ERROR').length
        const hasErrorVideos = errorCount > 0

        return (
          <Card key={groupName} className="overflow-hidden">
            <CardHeader
              className={cn(
                'cursor-pointer hover:bg-accent/50 transition-colors',
                'flex flex-row items-center justify-between space-y-0 py-3'
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
                        {hasProcessingVideos && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary-visible text-primary border border-primary-visible flex-shrink-0">
                            <div className="animate-spin rounded-full h-2.5 w-2.5 border-b border-primary"></div>
                            {processingCount} Processing
                          </span>
                        )}
                        {hasErrorVideos && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-destructive-visible text-destructive border border-destructive-visible flex-shrink-0">
                            {errorCount} Error
                          </span>
                        )}
                        {hasApprovedVideos && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-success-visible text-success border border-success-visible flex-shrink-0">
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
                      Latest: {latestVideo.versionLabel || `v${latestVideo.version}`}
                      {enableRevisions && maxRevisions && (
                        <> • Revisions {groupVideos.length}/{maxRevisions}</>
                      )}
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
              <CardContent className="border-t border-border pt-0 space-y-4">
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
                <div className="mt-5">
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
    </div>
  )
}
