'use client'

import { useState, forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { ChevronDown, ChevronUp, Video, CheckCircle2, Pencil } from 'lucide-react'
import VideoUpload from './VideoUpload'
import VideoList from './VideoList'
import { InlineEdit } from './InlineEdit'
import { VideoUploadModal } from './VideoUploadModal'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { apiPatch } from '@/lib/api-client'

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

export interface AdminVideoManagerHandle {
  triggerUpload: () => void
}

const AdminVideoManager = forwardRef<AdminVideoManagerHandle, AdminVideoManagerProps>(({
  projectId,
  videos,
  projectStatus,
  restrictToLatestVersion: _restrictToLatestVersion = false,
  companyName: _companyName = 'Studio',
  onRefresh,
  sortMode = 'alphabetical',
  maxRevisions,
  enableRevisions
}, ref) => {
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

  // Only allow one video expanded at a time - default collapsed
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null)
  const [editGroupValue, setEditGroupValue] = useState('')
  const [savingGroupName, setSavingGroupName] = useState<string | null>(null)

  // Expose triggerUpload method to parent via ref
  useImperativeHandle(ref, () => ({
    triggerUpload: () => {
      setIsUploadModalOpen(true)
    }
  }))

  // Handle upload completion from modal - refresh to show processing inline
  const handleUploadComplete = () => {
    onRefresh?.()
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
      .catch(() => {
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
    <div className="space-y-4">
      {/* Upload Modal - handles full upload with TUS, processing shows inline after */}
      <VideoUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        projectId={projectId}
        onUploadComplete={handleUploadComplete}
      />

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
})

AdminVideoManager.displayName = 'AdminVideoManager'

export default AdminVideoManager
