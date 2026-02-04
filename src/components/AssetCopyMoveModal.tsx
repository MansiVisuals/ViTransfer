'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, FileIcon, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { formatFileSize } from '@/lib/utils'
import { apiFetch, apiPost } from '@/lib/api-client'

interface VideoAsset {
  id: string
  fileName: string
  fileSize: string
  fileType: string
  category: string | null
  createdAt: string
}

interface Video {
  id: string
  name: string
  version: number
  versionLabel: string
}

interface AssetCopyMoveModalProps {
  currentVideoId: string
  currentVideoName: string
  currentVersionLabel: string
  projectId: string
  onClose: () => void
  onComplete?: () => void
  isOpen: boolean
}

export function AssetCopyMoveModal({
  currentVideoId,
  currentVideoName,
  currentVersionLabel,
  projectId,
  onClose,
  onComplete,
  isOpen,
}: AssetCopyMoveModalProps) {
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
  const [targetVideoId, setTargetVideoId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [copying, setCopying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch assets for current video
      const assetsResponse = await apiFetch(`/api/videos/${currentVideoId}/assets`)
      if (!assetsResponse.ok) {
        throw new Error('Failed to fetch assets')
      }
      const assetsData = await assetsResponse.json()
      setAssets(assetsData.assets)

      // Fetch all videos in project to choose target
      const videosResponse = await apiFetch(`/api/projects/${projectId}`)
      if (!videosResponse.ok) {
        throw new Error('Failed to fetch project videos')
      }
      const videosData = await videosResponse.json()

      // Filter out current video and only show other versions
      const otherVideos = videosData.videos.filter((v: Video) => v.id !== currentVideoId)
      setVideos(otherVideos)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [currentVideoId, projectId])

  useEffect(() => {
    if (isOpen) {
      fetchData()
    }
  }, [fetchData, isOpen])

  const toggleAsset = (assetId: string) => {
    const newSelected = new Set(selectedAssets)
    if (newSelected.has(assetId)) {
      newSelected.delete(assetId)
    } else {
      newSelected.add(assetId)
    }
    setSelectedAssets(newSelected)
  }

  const selectAll = () => {
    if (selectedAssets.size === assets.length) {
      setSelectedAssets(new Set())
    } else {
      setSelectedAssets(new Set(assets.map((a) => a.id)))
    }
  }

  const handleCopyAssets = async () => {
    if (selectedAssets.size === 0 || !targetVideoId) return

    setCopying(true)
    setError(null)
    setSuccess(null)

    // Copy assets in background without blocking UI
    apiPost(`/api/videos/${currentVideoId}/assets/copy-to-version`, {
      assetIds: Array.from(selectedAssets),
      targetVideoId,
    })
      .then((response) => {
        setSuccess(`Successfully copied ${selectedAssets.size} asset(s) to the selected version`)
        setSelectedAssets(new Set())

        if (onComplete) {
          onComplete()
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to copy assets')
      })
      .finally(() => {
        setCopying(false)
      })
  }

  const formatFileSizeBigInt = (bytes: string) => {
    return formatFileSize(Number(bytes))
  }

  const getCategoryLabel = (category: string | null) => {
    if (!category) return 'Other'
    return category.charAt(0).toUpperCase() + category.slice(1)
  }

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-primary" />
            Copy Assets to Another Version
          </DialogTitle>
          <DialogDescription>
            {currentVideoName} - {currentVersionLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Target version selector */}
              <div className="space-y-3">
                <label htmlFor="target-version" className="font-medium text-sm">
                  Select Target Version
                </label>
                {videos.length === 0 ? (
                  <div className="p-4 border-2 border-dashed border-border rounded-lg text-center text-sm text-muted-foreground">
                    No other versions available. Create a new version first.
                  </div>
                ) : (
                  <Select value={targetVideoId} onValueChange={setTargetVideoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="-- Select a version --" />
                    </SelectTrigger>
                    <SelectContent>
                      {videos.map((video) => (
                        <SelectItem key={video.id} value={video.id}>
                          {video.name} - {video.versionLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Assets selection */}
              {assets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No assets available to copy
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-sm">Select Assets to Copy ({assets.length})</h3>
                    <Button variant="ghost" size="sm" onClick={selectAll}>
                      {selectedAssets.size === assets.length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {assets.map((asset) => (
                      <div
                        key={asset.id}
                        className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAssets.has(asset.id)}
                          onChange={() => toggleAsset(asset.id)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <FileIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{asset.fileName}</p>
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span>{formatFileSizeBigInt(asset.fileSize)}</span>
                            <span>•</span>
                            <span>{getCategoryLabel(asset.category)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Success message */}
              {success && (
                <div className="p-3 bg-success-visible border border-success-visible rounded-md text-success text-sm">
                  {success}
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive rounded-md text-destructive text-sm">
                  {error}
                </div>
              )}

              <Button
                onClick={handleCopyAssets}
                disabled={copying || selectedAssets.size === 0 || !targetVideoId || videos.length === 0}
                className="w-full"
              >
                {copying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Copying assets...
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy {selectedAssets.size} asset(s)
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
