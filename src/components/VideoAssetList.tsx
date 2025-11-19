'use client'

import { useState, useEffect } from 'react'
import { FileIcon, Trash2, Loader2, Download, Image, Copy } from 'lucide-react'
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
    try {
      await apiDelete(`/api/videos/${videoId}/assets/${assetId}`)

      // Remove from local state
      setAssets(assets.filter(a => a.id !== assetId))

      // Notify parent component
      if (onAssetDeleted) {
        onAssetDeleted()
      }
    } catch (err) {
      alert('Failed to delete asset')
    } finally {
      setDeletingId(null)
    }
  }

  const getCategoryLabel = (category: string | null) => {
    if (!category) return 'Other'
    return category.charAt(0).toUpperCase() + category.slice(1)
  }

  const formatFileSizeBigInt = (bytes: string) => {
    return formatFileSize(Number(bytes))
  }

  const handleDownload = async (assetId: string, fileName: string) => {
    try {
      const response = await apiFetch(`/api/videos/${videoId}/assets/${assetId}`)
      if (!response.ok) {
        throw new Error('Download failed')
      }

      // Download the file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('Failed to download asset')
    }
  }

  const handleSetThumbnail = async (assetId: string, fileName: string) => {
    if (!confirm(`Set "${fileName}" as the video thumbnail?`)) {
      return
    }

    setSettingThumbnail(assetId)
    try {
      await apiPost(`/api/videos/${videoId}/assets/${assetId}/set-thumbnail`, {})
      alert('Thumbnail updated successfully')

      // Notify parent to refresh if needed
      if (onAssetDeleted) {
        onAssetDeleted()
      }
    } catch (err) {
      alert('Failed to set thumbnail')
    } finally {
      setSettingThumbnail(null)
    }
  }

  const canSetAsThumbnail = (category: string | null, fileType: string) => {
    // Only assets with 'thumbnail' category can be set as video thumbnail
    if (category !== 'thumbnail') {
      return false
    }

    // Verify it's actually an image file (check if it starts with 'image/')
    return fileType.toLowerCase().startsWith('image/')
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
              <FileIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
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
                    title="Set as video thumbnail"
                  >
                    {settingThumbnail === asset.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Image className="h-4 w-4 text-blue-500" />
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
