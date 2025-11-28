'use client'

import { useState, useEffect } from 'react'
import { X, Download, FileIcon, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { formatFileSize } from '@/lib/utils'
import { getAccessToken } from '@/lib/token-store'

interface VideoAsset {
  id: string
  fileName: string
  fileSize: string
  fileType: string
  category: string | null
  createdAt: string
}

interface VideoAssetDownloadModalProps {
  videoId: string
  videoName: string
  versionLabel: string
  onClose: () => void
  isOpen: boolean
  shareToken?: string | null
  isAdmin?: boolean
}

export function VideoAssetDownloadModal({
  videoId,
  videoName,
  versionLabel,
  onClose,
  isOpen,
  shareToken = null,
  isAdmin = false,
}: VideoAssetDownloadModalProps) {
  const [assets, setAssets] = useState<VideoAsset[]>([])
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      fetchAssets()
    }
  }, [isOpen, videoId])

  const fetchAssets = async () => {
    try {
      setLoading(true)
      setError(null)

      const headers = buildAuthHeaders(shareToken, isAdmin)
      const response = await fetch(`/api/videos/${videoId}/assets`, {
        headers,
      })
      if (!response.ok) {
        throw new Error('Failed to fetch assets')
      }

      const data = await response.json()
      setAssets(data.assets)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets')
    } finally {
      setLoading(false)
    }
  }

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

  const downloadSingleAsset = async (assetId: string) => {
    try {
      setError(null)

      // Use token-based download for everyone (instant, no memory loading)
      const response = await fetch(`/api/videos/${videoId}/assets/${assetId}/download-token`, {
        method: 'POST',
        headers: buildAuthHeaders(shareToken, isAdmin),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to generate download link' }))
        throw new Error(data.error || 'Failed to generate download link')
      }

      const { url: downloadUrl } = await response.json()
      window.open(downloadUrl, '_blank')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    }
  }

  const downloadVideoOnly = async () => {
    try {
      setError(null)

      // Use token-based download for everyone (instant, no memory loading)
      const response = await fetch(`/api/videos/${videoId}/download-token`, {
        method: 'POST',
        headers: buildAuthHeaders(shareToken, isAdmin),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to generate download link' }))
        throw new Error(data.error || 'Failed to generate download link')
      }

      const { url: downloadUrl } = await response.json()
      window.open(downloadUrl, '_blank')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    }
  }

  const downloadSelectedAsZip = async () => {
    if (selectedAssets.size === 0 || downloading) return

    try {
      setDownloading(true)
      setError(null)

      // Generate download token for ZIP (non-blocking, no memory loading)
      const response = await fetch(`/api/videos/${videoId}/assets/download-zip-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(shareToken, isAdmin),
        },
        body: JSON.stringify({
          assetIds: Array.from(selectedAssets),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Download failed')
      }

      const { url: downloadUrl } = await response.json()

      // Direct download via window.open (streaming, non-blocking, supports multiple simultaneous downloads)
      window.open(downloadUrl, '_blank')

      // Close modal shortly after initiating download
      setTimeout(() => {
        onClose()
      }, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-bold">Download Options</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {videoName} - {versionLabel}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick actions */}
          <div className="space-y-3">
            <h3 className="font-medium text-sm">Quick Download</h3>
            <button
              onClick={downloadVideoOnly}
              className="w-full p-4 border-2 border-border rounded-lg hover:border-primary transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Download Video Only</p>
                  <p className="text-sm text-muted-foreground">
                    Download the approved video file
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* Assets section */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No additional assets available for this video
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">
                  Additional Assets ({assets.length})
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                >
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => downloadSingleAsset(asset.id)}
                      title="Download this file"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Download selected button */}
              {selectedAssets.size > 0 && (
                <Button
                  onClick={downloadSelectedAsZip}
                  disabled={downloading}
                  className="w-full"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Preparing download...
                    </>
                  ) : (
                    <>
                      <Download className="h-5 w-5 mr-2" />
                      Download {selectedAssets.size} selected as ZIP
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive rounded-md text-destructive text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border">
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

function buildAuthHeaders(shareToken?: string | null, isAdmin?: boolean) {
  const headers: Record<string, string> = {}
  const token = shareToken || (isAdmin ? getAccessToken() : null)
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}
