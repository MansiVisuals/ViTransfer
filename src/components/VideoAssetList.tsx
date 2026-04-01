'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  FileImage,
  FileVideo,
  FilePlay,
  FileMusic,
  FileText,
  File,
  FileArchive,
  ImagePlay,
  Trash2,
  Loader2,
  Download,
  Copy,
  Package,
  ChevronDown,
  ChevronUp,
  Square,
  CheckSquare,
} from 'lucide-react'
import { Button } from './ui/button'
import { formatFileSize } from '@/lib/utils'
import { apiFetch, apiDelete, apiPost } from '@/lib/api-client'
import { AssetCopyMoveModal } from './AssetCopyMoveModal'

interface VideoAsset {
  id: string
  fileName: string
  fileSize: string
  fileType: string
  category: string | null
  uploadedBy: string | null
  createdAt: string
}

interface VideoAssetListProps {
  videoId: string
  videoName: string
  versionLabel: string
  projectId: string
  onAssetDeleted?: () => void
  refreshTrigger?: number // Used to trigger refetch from parent
  defaultCollapsed?: boolean // Default: true - collapsed by default
}

export function VideoAssetList({ videoId, videoName, versionLabel, projectId, onAssetDeleted, refreshTrigger, defaultCollapsed = true }: VideoAssetListProps) {
  const t = useTranslations('videos')
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [settingThumbnail, setSettingThumbnail] = useState<string | null>(null)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentThumbnailPath, setCurrentThumbnailPath] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await apiFetch(`/api/videos/${videoId}/assets`)

      if (!response.ok) {
        throw new Error('Failed to fetch assets')
      }

      const data = await response.json()
      setAssets(data.assets || [])
      setCurrentThumbnailPath(data.currentThumbnailPath || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets')
    } finally {
      setLoading(false)
    }
  }, [videoId])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets, refreshTrigger])

  const handleDelete = async (assetId: string, fileName: string) => {
    if (!confirm(`${t('deleteAssetConfirm')} "${fileName}"?`)) {
      return
    }

    setDeletingId(assetId)

    // Optimistically remove from UI
    const previousAssets = assets
    setAssets(assets.filter(a => a.id !== assetId))

    // Delete in background without blocking UI
    apiDelete(`/api/videos/${videoId}/assets/${assetId}`)
      .then(() => {
        // Notify parent component
        if (onAssetDeleted) {
          onAssetDeleted()
        }
      })
      .catch(() => {
        // Restore on error
        setAssets(previousAssets)
        alert(t('failedToDeleteAsset'))
      })
      .finally(() => {
        setDeletingId(null)
      })
  }

  const getCategoryLabel = (category: string | null) => {
    if (!category) return t('other')
    return category.charAt(0).toUpperCase() + category.slice(1)
  }

  const canSetAsThumbnail = (asset: VideoAsset) => {
    const fileType = asset.fileType?.toLowerCase() || ''
    const fileName = asset.fileName.toLowerCase()
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : ''

    // Align with API requirements: only JPG/PNG assets can become thumbnails
    const allowedThumbnailMimeTypes = ['image/jpeg', 'image/png', 'image/jpg']
    const allowedThumbnailExtensions = ['.jpg', '.jpeg', '.png']

    return allowedThumbnailMimeTypes.includes(fileType) || allowedThumbnailExtensions.includes(ext)
  }

  const formatFileSizeBigInt = (bytes: string) => {
    return formatFileSize(Number(bytes))
  }

  const getAssetIcon = (asset: VideoAsset) => {
    const fileType = asset.fileType?.toLowerCase() || ''
    const fileName = asset.fileName.toLowerCase()
    const category = asset.category?.toLowerCase() || ''

    if (category === 'thumbnail' || fileType.startsWith('image/')) {
      return <FileImage className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    }

    if (category === 'project') {
      return <FilePlay className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    }

    if (fileType.startsWith('video/')) {
      return <FileVideo className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    }

    if (fileType.startsWith('audio/')) {
      return <FileMusic className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    }

    if (
      fileType === 'application/zip' ||
      fileType === 'application/x-zip-compressed' ||
      fileName.endsWith('.zip')
    ) {
      return <FileArchive className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    }

    if (
      category === 'caption' ||
      fileName.endsWith('.srt') ||
      fileName.endsWith('.vtt') ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.md')
    ) {
      return <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
    }

    return <File className="h-5 w-5 text-muted-foreground flex-shrink-0" />
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

  const handleDownload = async (assetId: string, _fileName: string) => {
    // Generate download token in background without blocking UI
    apiFetch(`/api/videos/${videoId}/assets/${assetId}/download-token`, {
      method: 'POST'
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to generate download link')
        }
        return response.json()
      })
      .then(({ url }) => {
        triggerDownload(url)
      })
      .catch(() => {
        alert(t('failedToDownloadAsset'))
      })
  }

  const handleSetThumbnail = async (assetId: string, fileName: string) => {
    // Find the asset to check if it's currently active
    const asset = assets.find(a => a.id === assetId)
    const isCurrent = asset ? isCurrentThumbnail(asset) : false

    // Toggle behavior: if current, remove it; if not current, set it
    const action = isCurrent ? 'remove' : 'set'
    const confirmMessage = isCurrent
      ? t('removeThumbnailConfirm')
      : t('setThumbnailConfirm')

    if (!confirm(confirmMessage)) {
      return
    }

    setSettingThumbnail(assetId)

    // Set thumbnail in background without blocking UI
    apiPost(`/api/videos/${videoId}/assets/${assetId}/set-thumbnail`, { action })
      .then(() => {
        // Refresh assets to get updated thumbnail path
        return fetchAssets()
      })
      .then(() => {
        // Notify parent to refresh if needed
        if (onAssetDeleted) {
          onAssetDeleted()
        }
      })
      .catch(() => {
        alert(action === 'set' ? t('failedToSetThumbnail') : t('failedToRemoveThumbnail'))
      })
      .finally(() => {
        setSettingThumbnail(null)
      })
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
    if (selectedIds.size === assets.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(assets.map(a => a.id)))
    }
  }

  const handleBulkDownload = async () => {
    setBulkDownloading(true)
    for (const assetId of Array.from(selectedIds)) {
      await new Promise<void>((resolve) => {
        apiFetch(`/api/videos/${videoId}/assets/${assetId}/download-token`, { method: 'POST' })
          .then(r => r.ok ? r.json() : Promise.reject())
          .then(({ url }) => { triggerDownload(url) })
          .catch(() => {})
          .finally(resolve)
      })
    }
    setBulkDownloading(false)
  }

  const handleBulkDelete = async () => {
    if (!confirm(`${t('deleteAssetConfirm')} (${selectedIds.size})?`)) return
    setBulkDeleting(true)
    const toDelete = Array.from(selectedIds)
    for (const assetId of toDelete) {
      try {
        await apiDelete(`/api/videos/${videoId}/assets/${assetId}`)
        setAssets(prev => prev.filter(a => a.id !== assetId))
        setSelectedIds(prev => { const next = new Set(prev); next.delete(assetId); return next })
      } catch {}
    }
    setBulkDeleting(false)
    if (onAssetDeleted) onAssetDeleted()
  }

  const isCurrentThumbnail = (asset: VideoAsset) => {
    if (!currentThumbnailPath) return false
    // Check if this asset's storage path matches the video's thumbnailPath
    // The thumbnailPath might be a relative path, so we need to check if it contains the asset info
    return currentThumbnailPath.includes(asset.id) || currentThumbnailPath.includes(asset.fileName)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t('loadingAssets')}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 border border-destructive px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    )
  }

  if (assets.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Package className="h-4 w-4" />
        <span>{t('noAssets')}</span>
      </div>
    )
  }

  // Collapsed view - just show count with expand button
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
      >
        <Package className="h-4 w-4" />
        <span>{t('assets')} ({assets.length})</span>
        <ChevronDown className="h-4 w-4" />
      </button>
    )
  }

  // Expanded view - full asset list
  const allSelected = assets.length > 0 && selectedIds.size === assets.length
  const someSelected = selectedIds.size > 0

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setIsExpanded(false)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Package className="h-4 w-4" />
            <span>{t('assets')} ({assets.length})</span>
            <ChevronUp className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            {assets.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCopyModal(true)}
              >
                <Copy className="h-4 w-4 mr-2" />
                {t('copyToVersion')}
              </Button>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {someSelected && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/60 border text-sm mb-2">
            <button type="button" onClick={toggleSelectAll} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              <span>{selectedIds.size} / {assets.length}</span>
            </button>
            <div className="flex-1" />
            <Button type="button" variant="outline" size="sm" onClick={handleBulkDownload} disabled={bulkDownloading || bulkDeleting}>
              {bulkDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
              {t('downloadAsset')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleBulkDelete} disabled={bulkDeleting || bulkDownloading} className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60">
              {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
              {t('deleteAsset')}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {assets.map((asset) => {
            const isSelected = selectedIds.has(asset.id)
            return (
            <div
              key={asset.id}
              className={`flex items-center gap-3 rounded-md border bg-card p-2 transition-colors hover:bg-accent/50 ${isSelected ? 'ring-1 ring-primary/30 bg-primary/5' : ''}`}
            >
              <button
                type="button"
                onClick={() => toggleSelect(asset.id)}
                className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                aria-label="Select"
              >
                {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
              </button>
              {getAssetIcon(asset)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{asset.fileName}</p>
                <div className="flex gap-3 text-xs text-muted-foreground items-center">
                  <span>{formatFileSizeBigInt(asset.fileSize)}</span>
                  <span>•</span>
                  <span>{getCategoryLabel(asset.category)}</span>
                  {asset.uploadedBy === 'client' && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                      {t('clientUpload')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {canSetAsThumbnail(asset) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleSetThumbnail(asset.id, asset.fileName)}
                    disabled={settingThumbnail === asset.id}
                    title={isCurrentThumbnail(asset) ? t('removeCustomThumbnail') : t('setAsThumbnail')}
                  >
                    {settingThumbnail === asset.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlay className={`h-4 w-4 ${isCurrentThumbnail(asset) ? 'text-green-600' : ''}`} />
                    )}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDownload(asset.id, asset.fileName)}
                  title={t('downloadAsset')}
                >
                  <Download className="h-4 w-4 text-primary" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(asset.id, asset.fileName)}
                  disabled={deletingId === asset.id}
                  title={t('deleteAsset')}
                >
                  {deletingId === asset.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-destructive" />
                  )}
                </Button>
              </div>
            </div>
            )
          })}
        </div>
      </div>

      <AssetCopyMoveModal
        currentVideoId={videoId}
        currentVideoName={videoName}
        currentVersionLabel={versionLabel}
        projectId={projectId}
        isOpen={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        onComplete={() => {
          setShowCopyModal(false)
          if (onAssetDeleted) {
            onAssetDeleted()
          }
        }}
      />
    </>
  )
}
