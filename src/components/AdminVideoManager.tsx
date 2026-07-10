'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { ChevronDown, ChevronUp, Video, CheckCircle2, Loader2, Pencil, Trash2, Upload } from 'lucide-react'
import VideoUpload from './VideoUpload'
import VideoList from './VideoList'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { InlineEdit } from './InlineEdit'
import { VideoUploadModal } from './VideoUploadModal'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { apiPatch, apiFetch, apiDelete } from '@/lib/api-client'
import { FILE_LIMITS } from '@/lib/file-validation'
import { entryToFiles } from '@/lib/drop-entries'
import { useTranslations } from 'next-intl'

function isVideoFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return FILE_LIMITS.ALLOWED_EXTENSIONS.includes(name.slice(name.lastIndexOf('.')))
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
  restrictToLatestVersion: _restrictToLatestVersion = false,
  companyName: _companyName = 'Studio',
  onRefresh,
  sortMode = 'alphabetical',
  maxRevisions,
  enableRevisions
}: AdminVideoManagerProps) {
  const t = useTranslations('videos')
  const tc = useTranslations('common')
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
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null)
  const [editGroupValue, setEditGroupValue] = useState('')
  const [savingGroupName, setSavingGroupName] = useState<string | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ name: string; label: string; token: string } | null>(null)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [sessionId] = useState<string>(() => `admin:${Date.now()}`)

  // Fetch a thumbnail per video group (latest version that has one)
  useEffect(() => {
    let cancelled = false

    const fetchThumbnails = async () => {
      const groups = videos.reduce((acc: Record<string, any[]>, video) => {
        ;(acc[video.name] = acc[video.name] || []).push(video)
        return acc
      }, {})

      const entries = await Promise.all(
        Object.entries(groups).map(async ([name, groupVideos]) => {
          const videoWithThumb = [...(groupVideos as any[])]
            .sort((a, b) => b.version - a.version)
            .find(v => v.thumbnailPath)
          if (!videoWithThumb) return null

          try {
            const res = await apiFetch(
              `/api/admin/video-token?videoId=${videoWithThumb.id}&projectId=${projectId}&quality=thumbnail&sessionId=${sessionId}`,
              { cache: 'no-store' }
            )
            if (!res.ok) return null
            const data = await res.json()
            return data.token ? ([name, `/api/content/${data.token}`] as const) : null
          } catch {
            return null
          }
        })
      )

      if (!cancelled) {
        setThumbnails(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>))
      }
    }

    fetchThumbnails()
    return () => { cancelled = true }
  }, [videos, projectId, sessionId])

  // Handle upload completion from modal - refresh to show processing inline
  const handleUploadComplete = () => {
    onRefresh?.()
  }

  // Preview the latest READY version's transcoded preview (never the original file)
  const handlePreview = async (groupName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const latest = [...videoGroups[groupName]]
      .sort((a, b) => b.version - a.version)
      .find(v => v.status === 'READY')
    if (!latest) return

    try {
      const res = await apiFetch(
        `/api/admin/video-token?videoId=${latest.id}&projectId=${projectId}&quality=720p&sessionId=${sessionId}`,
        { cache: 'no-store' }
      )
      if (!res.ok) return
      const data = await res.json()
      if (data.token) {
        setPreview({ name: groupName, label: latest.versionLabel || `v${latest.version}`, token: data.token })
      }
    } catch {}
  }

  // Delete a video group: removes every version of the video
  const handleDeleteGroup = async (groupName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deletingGroup) return
    if (!confirm(t('deleteGroupConfirm'))) return

    setDeletingGroup(groupName)
    try {
      for (const video of videoGroups[groupName]) {
        await apiDelete(`/api/videos/${video.id}`)
      }
      router.refresh()
      onRefresh?.()
    } catch {
      alert(t('deleteGroupFailed'))
    } finally {
      setDeletingGroup(null)
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current += 1
    setIsDragOver(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current -= 1
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragOver(false)
    }
  }

  // Drop video files or folders (flattened) onto the section: open the upload modal pre-filled
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragOver(false)
    if (projectStatus === 'APPROVED') return

    // webkitGetAsEntry must be read synchronously before any await
    const entries = Array.from(e.dataTransfer.items || [])
      .map(item => (item as any).webkitGetAsEntry?.())
      .filter(Boolean)

    const files = entries.length > 0
      ? (await Promise.all(entries.map(entryToFiles))).flat()
      : Array.from(e.dataTransfer.files || [])

    const videoFiles = files.filter(isVideoFile)
    if (videoFiles.length === 0) return

    setDroppedFiles(videoFiles)
    setIsUploadModalOpen(true)
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
      alert(t('videoNameEmpty'))
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
        alert(t('failedToUpdateName'))
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
      className={`space-y-4 rounded-lg transition-shadow ${isDragOver ? 'ring-2 ring-primary/60' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && projectStatus !== 'APPROVED' && (
        <div className="px-3 py-2 rounded-lg border border-dashed border-primary/60 bg-primary/5 text-sm text-primary">
          {t('dropVideosHint')}
        </div>
      )}
      {/* Upload Modal - handles full upload with TUS, processing shows inline after */}
      <VideoUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => { setIsUploadModalOpen(false); setDroppedFiles([]) }}
        projectId={projectId}
        onUploadComplete={handleUploadComplete}
        initialFiles={droppedFiles}
      />

      {sortedGroupNames.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Video className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('noVideosYet')}</p>
            {projectStatus !== 'APPROVED' && (
              <Button variant="outline" size="sm" onClick={() => setIsUploadModalOpen(true)}>
                <Upload className="w-3.5 h-3.5 mr-1" />
                {t('uploadFirstVideo')}
              </Button>
            )}
          </CardContent>
        </Card>
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
                'flex flex-row items-center justify-between space-y-0 py-3 px-3 sm:px-6'
              )}
              onClick={() => toggleGroup(groupName)}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {thumbnails[groupName] ? (
                  <button
                    type="button"
                    onClick={(e) => handlePreview(groupName, e)}
                    className="flex-shrink-0 cursor-zoom-in"
                    title={t('previewVideo')}
                    aria-label={t('previewVideo')}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbnails[groupName]}
                      alt={groupName}
                      loading="lazy"
                      className="w-20 h-12 rounded-md object-cover border border-border bg-muted"
                    />
                  </button>
                ) : (
                  <div className="w-20 h-12 rounded-md border border-border bg-muted flex items-center justify-center flex-shrink-0">
                    <Video className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
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
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary-visible flex-shrink-0"
                              onClick={(e) => handleStartEditGroupName(groupName, e)}
                              title={t('editVideoName')}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive-visible flex-shrink-0"
                              onClick={(e) => handleDeleteGroup(groupName, e)}
                              disabled={deletingGroup === groupName}
                              title={t('deleteVideo')}
                            >
                              {deletingGroup === groupName
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Trash2 className="w-3 h-3" />}
                            </Button>
                          </>
                        )}
                        {hasProcessingVideos && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary-visible text-primary border border-primary-visible flex-shrink-0">
                            <div className="animate-spin rounded-full h-2.5 w-2.5 border-b border-primary"></div>
                            {processingCount} {t('processing')}
                          </span>
                        )}
                        {hasErrorVideos && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-destructive-visible text-destructive border border-destructive-visible flex-shrink-0">
                            {errorCount} {t('error')}
                          </span>
                        )}
                        {hasApprovedVideos && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-success-visible text-success border border-success-visible flex-shrink-0">
                            <CheckCircle2 className="w-3 h-3" />
                            {approvedCount} {t('approved')}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {editingGroupName !== groupName && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {groupVideos.length} {groupVideos.length === 1 ? t('versionSingular') : t('versions')} • {t('latestLabel')} {latestVideo.versionLabel || `v${latestVideo.version}`}
                      {enableRevisions && maxRevisions && (
                        <> • {t('revisionsLabel')} {groupVideos.length}/{maxRevisions}</>
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
              <CardContent className="border-t border-border pt-0 px-3 sm:px-6 space-y-4">
                {/* Upload new version for this video */}
                {projectStatus !== 'APPROVED' && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-3">{t('uploadNewVersion')}</h4>
                    <VideoUpload
                      projectId={projectId}
                      videoName={groupName}
                      onUploadComplete={handleUploadComplete}
                    />
                  </div>
                )}

                {/* Version list */}
                <div className="mt-5">
                  <h4 className="text-sm font-medium mb-3">{t('allVersions')}</h4>
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

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.name} — {preview?.label}</DialogTitle>
          </DialogHeader>
          {preview && (
            <video
              src={`/api/content/${preview.token}`}
              controls
              autoPlay
              className="w-full max-h-[70vh] bg-black rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>

      {sortedGroupNames.length > 0 && projectStatus !== 'APPROVED' && (
        <button
          type="button"
          onClick={() => setIsUploadModalOpen(true)}
          className="w-full flex items-center gap-3 py-3 px-3 sm:px-6 rounded-lg border border-dashed bg-card hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
        >
          <div className="w-20 h-12 rounded-md border border-dashed border-border flex items-center justify-center flex-shrink-0">
            <Upload className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium">{t('uploadFirstVideo')}</span>
        </button>
      )}
    </div>
  )
}
