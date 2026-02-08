'use client'

import { useState } from 'react'
import { FileText, Image, Music, Film, Download, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

interface CommentAsset {
  id: string
  fileName: string
  fileSize: string
  fileType: string
  category: string | null
  createdAt: string
}

interface CommentAttachmentsProps {
  assets: CommentAsset[]
  videoId: string
  shareToken?: string | null
}

function formatFileSize(bytes: string | number): string {
  const size = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes
  if (isNaN(size) || size === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function getCategoryIcon(category: string | null, fileType: string) {
  if (category === 'image' || fileType.startsWith('image/')) return Image
  if (category === 'audio' || fileType.startsWith('audio/')) return Music
  if (category === 'video' || fileType.startsWith('video/')) return Film
  return FileText
}

export default function CommentAttachments({
  assets,
  videoId,
  shareToken,
}: CommentAttachmentsProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  if (!assets || assets.length === 0) return null

  const handleDownload = async (assetId: string) => {
    setDownloadingId(assetId)
    try {
      let response: Response
      if (shareToken) {
        // Share page: use raw fetch with share token
        response = await fetch(
          `/api/videos/${videoId}/assets/${assetId}/download-token`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${shareToken}` },
          }
        )
      } else {
        // Admin page: use apiFetch which includes JWT
        response = await apiFetch(
          `/api/videos/${videoId}/assets/${assetId}/download-token`,
          { method: 'POST' }
        )
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Download failed')
      }

      const { url } = await response.json()
      window.open(url, '_blank')
    } catch (error) {
      alert(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      {assets.map((asset) => {
        const Icon = getCategoryIcon(asset.category, asset.fileType)
        const isDownloading = downloadingId === asset.id

        return (
          <button
            key={asset.id}
            onClick={() => handleDownload(asset.id)}
            disabled={isDownloading}
            className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/40 border border-border/50 rounded-md text-sm hover:bg-muted/60 transition-colors w-full text-left group"
          >
            <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="truncate flex-1 text-foreground">{asset.fileName}</span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatFileSize(asset.fileSize)}
            </span>
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin flex-shrink-0" />
            ) : (
              <Download className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            )}
          </button>
        )
      })}
    </div>
  )
}
