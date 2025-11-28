'use client'

import { useState, useEffect } from 'react'
import {
  FileIcon,
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
  Copy
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
  createdAt: string
}

interface VideoAssetListProps {
  videoId: string
  videoName: string
  versionLabel: string
  projectId: string
  onAssetDeleted?: () => void
  refreshTrigger?: number // Used to trigger refetch from parent
}

export function VideoAssetList({ videoId, videoName, versionLabel, projectId, onAssetDeleted, refreshTrigger }: VideoAssetListProps) {
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [settingThumbnail, setSettingThumbnail] = useState<string | null>(null)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentThumbnailPath, setCurrentThumbnailPath] = useState<string | null>(null)

  useEffect(() => {
    fetchAssets()
  }, [videoId, refreshTrigger])

  const fetchAssets = async () => {
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
  }

  const handleDelete = async (assetId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
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
      .catch((err) => {
        // Restore on error
        setAssets(previousAssets)
        alert('Failed to delete asset')
      })
      .finally(() => {
        setDeletingId(null)
      })
  }

  const getCategoryLabel = (category: string | null) => {
    if (!category) return 'Other'
    return category.charAt(0).toUpperCase() + category.slice(1)
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

  const handleDownload = async (assetId: string, fileName: string) => {
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
        window.open(url, '_blank')
      })
      .catch((err) => {
        alert('Failed to download asset')
      })
  }

  const handleSetThumbnail = async (assetId: string, fileName: string) => {
    // Find the asset to check if it's currently active
    const asset = assets.find(a => a.id === assetId)
    const isCurrent = asset ? isCurrentThumbnail(asset) : false

    // Toggle behavior: if current, remove it; if not current, set it
    const action = isCurrent ? 'remove' : 'set'
    const confirmMessage = isCurrent
      ? `Remove "${fileName}" as the video thumbnail? The system-generated thumbnail will be used instead.`
      : `Set "${fileName}" as the video thumbnail?`

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
      .catch((err) => {
        alert(`Failed to ${action} thumbnail`)
      })
      .finally(() => {
        setSettingThumbnail(null)
      })
  }

  const canSetAsThumbnail = (category: string | null, fileType: string) => {
    // Only assets with 'thumbnail' category can be set as video thumbnail
    if (category !== 'thumbnail') {
      return false
    }

    // Verify it's actually an image file (check if it starts with 'image/')
    return fileType.toLowerCase().startsWith('image/')
  }

  const isCurrentThumbnail = (asset: VideoAsset) => {
    if (!currentThumbnailPath) return false
    // Check if this asset's storage path matches the video's thumbnailPath
    // The thumbnailPath might be a relative path, so we need to check if it contains the asset info
    return currentThumbnailPath.includes(asset.id) || currentThumbnailPath.includes(asset.fileName)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
      <div className="text-center py-6 text-sm text-muted-foreground">
        No assets uploaded for this video yet
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium text-muted-foreground">
            Uploaded Assets ({assets.length})
          </div>
          {assets.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCopyModal(true)}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy to Version
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center gap-3 p-3 rounded-md border bg-card hover:bg-accent/50 transition-colors"
            >
              {getAssetIcon(asset)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{asset.fileName}</p>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{formatFileSizeBigInt(asset.fileSize)}</span>
                  <span>•</span>
                  <span>{getCategoryLabel(asset.category)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {canSetAsThumbnail(asset.category, asset.fileType) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleSetThumbnail(asset.id, asset.fileName)}
                    disabled={settingThumbnail === asset.id}
                    title={isCurrentThumbnail(asset) ? "Remove custom thumbnail (revert to system-generated)" : "Set as video thumbnail"}
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
                  title="Download asset"
                >
                  <Download className="h-4 w-4 text-primary" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(asset.id, asset.fileName)}
                  disabled={deletingId === asset.id}
                  title="Delete asset"
                >
                  {deletingId === asset.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-destructive" />
                  )}
                </Button>
              </div>
            </div>
          ))}
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
