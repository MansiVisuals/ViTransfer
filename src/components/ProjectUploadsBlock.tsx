'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { FolderUp, Download, Trash2, Loader2, FileIcon, FileImage, FileVideo, FileMusic, FileArchive, FileText, FilePlay, Square, CheckSquare } from 'lucide-react'
import { formatFileSize } from '@/lib/utils'
import { Button } from './ui/button'
import { apiFetch } from '@/lib/api-client'
import { logError } from '@/lib/logging'

interface ProjectUpload {
  id: string
  fileName: string
  fileSize: string
  fileType: string
  category: string | null
  uploadedByName: string | null
  uploadedByEmail: string | null
  createdAt: string
}

interface ProjectUploadsBlockProps {
  projectId: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getCategoryLabel(category: string | null): string {
  if (!category) return 'Other'
  return category.charAt(0).toUpperCase() + category.slice(1)
}

function getUploadIcon(fileType: string, fileName: string, category: string | null) {
  const ft = fileType?.toLowerCase() || ''
  const fn = fileName.toLowerCase()
  const cat = category?.toLowerCase() || ''

  if (cat === 'thumbnail' || ft.startsWith('image/')) {
    return <FileImage className="w-4 h-4 text-muted-foreground flex-shrink-0" />
  }
  if (cat === 'project') {
    return <FilePlay className="w-4 h-4 text-muted-foreground flex-shrink-0" />
  }
  if (ft.startsWith('video/')) {
    return <FileVideo className="w-4 h-4 text-muted-foreground flex-shrink-0" />
  }
  if (ft.startsWith('audio/')) {
    return <FileMusic className="w-4 h-4 text-muted-foreground flex-shrink-0" />
  }
  if (ft === 'application/zip' || ft === 'application/x-zip-compressed' || fn.endsWith('.zip') || fn.endsWith('.rar') || fn.endsWith('.7z')) {
    return <FileArchive className="w-4 h-4 text-muted-foreground flex-shrink-0" />
  }
  if (ft.startsWith('text/') || fn.endsWith('.srt') || fn.endsWith('.vtt') || fn.endsWith('.txt') || fn.endsWith('.pdf') || fn.endsWith('.doc') || fn.endsWith('.docx')) {
    return <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
  }
  return <FileIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
}

export default function ProjectUploadsBlock({ projectId }: ProjectUploadsBlockProps) {
  const t = useTranslations('projects')
  const tc = useTranslations('common')

  const [uploads, setUploads] = useState<ProjectUpload[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const fetchUploads = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/project-uploads`)
      if (res.ok) {
        const data = await res.json()
        setUploads(data.uploads || [])
      }
    } catch (error) {
      logError('Error fetching project uploads:', error)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchUploads()
  }, [fetchUploads])

  const handleDownload = async (upload: ProjectUpload) => {
    setDownloadingId(upload.id)
    try {
      const res = await apiFetch(`/api/projects/${projectId}/project-uploads/${upload.id}/download`)
      if (!res.ok) {
        logError('Download failed', await res.json().catch(() => ({})))
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = upload.fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      logError('Error downloading project upload:', error)
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDelete = async (upload: ProjectUpload) => {
    if (!confirm(t('confirmDeleteUpload'))) return
    setDeletingId(upload.id)
    try {
      const res = await apiFetch(`/api/projects/${projectId}/project-uploads?uploadId=${upload.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setUploads((prev) => prev.filter((u) => u.id !== upload.id))
      }
    } catch (error) {
      logError('Error deleting project upload:', error)
    } finally {
      setDeletingId(null)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === uploads.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(uploads.map(u => u.id)))
    }
  }

  const handleBulkDownload = async () => {
    setBulkDownloading(true)
    for (const upload of uploads.filter(u => selectedIds.has(u.id))) {
      try {
        const res = await apiFetch(`/api/projects/${projectId}/project-uploads/${upload.id}/download`)
        if (!res.ok) continue
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = upload.fileName
        a.click()
        URL.revokeObjectURL(url)
      } catch (error) {
        logError('Error downloading project upload:', error)
      }
    }
    setBulkDownloading(false)
  }

  const handleBulkDelete = async () => {
    if (!confirm(t('confirmDeleteUpload'))) return
    setBulkDeleting(true)
    for (const id of Array.from(selectedIds)) {
      try {
        const res = await apiFetch(`/api/projects/${projectId}/project-uploads?uploadId=${id}`, { method: 'DELETE' })
        if (res.ok) {
          setUploads(prev => prev.filter(u => u.id !== id))
          setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next })
        }
      } catch (error) {
        logError('Error deleting project upload:', error)
      }
    }
    setBulkDeleting(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const allSelected = uploads.length > 0 && selectedIds.size === uploads.length
  const someSelected = selectedIds.size > 0

  return (
    <div>
      {uploads.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          {t('noClientUploads')}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Bulk action bar */}
          {someSelected && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/60 border text-sm mb-2">
              <button type="button" onClick={toggleSelectAll} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                <span>{selectedIds.size} / {uploads.length}</span>
              </button>
              <div className="flex-1" />
              <Button type="button" variant="outline" size="sm" onClick={handleBulkDownload} disabled={bulkDownloading || bulkDeleting}>
                {bulkDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                {tc('download')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleBulkDelete} disabled={bulkDeleting || bulkDownloading} className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60">
                {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                {tc('delete')}
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {uploads.map((upload) => {
            const uploader = upload.uploadedByName || upload.uploadedByEmail || t('unknownUploader')
            const isSelected = selectedIds.has(upload.id)
            return (
              <div
                key={upload.id}
                className={`flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors ${isSelected ? 'ring-1 ring-primary/30 bg-primary/5' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => toggleSelect(upload.id)}
                  className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                  aria-label="Select"
                >
                  {isSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                </button>

                {getUploadIcon(upload.fileType, upload.fileName, upload.category)}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{upload.fileName}</p>
                  <div className="flex gap-2 text-xs text-muted-foreground items-center flex-wrap">
                    <span>{formatFileSize(Number(upload.fileSize))}</span>
                    <span>•</span>
                    <span>{getCategoryLabel(upload.category)}</span>
                    <span>•</span>
                    <span className="truncate">{uploader}</span>
                    <span>•</span>
                    <span className="truncate">{formatDate(upload.createdAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDownload(upload)}
                    disabled={downloadingId === upload.id}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    title={tc('download')}
                  >
                    {downloadingId === upload.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Download className="w-4 h-4" />
                    }
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(upload)}
                    disabled={deletingId === upload.id}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    title={tc('delete')}
                  >
                    {deletingId === upload.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />
                    }
                  </button>
                </div>
              </div>
            )
          })}
          </div>
        </div>
      )}
    </div>
  )
}
