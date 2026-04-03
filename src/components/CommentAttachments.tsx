'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { FileText, Image, Music, Film, Download, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { formatFileSize } from '@/lib/utils'

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
  const t = useTranslations('comments')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  if (!assets || assets.length === 0) return null

  const handleDownload = async (assetId: string) => {
    setDownloadingId(assetId)
    setDownloadError(null)
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
        throw new Error(err.error || t('downloadFailed'))
      }

      const { url } = await response.json()
      window.location.href = url
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : t('downloadFailed'))
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      {downloadError && (
        <p className="text-xs text-destructive">{downloadError}</p>
      )}
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
              {formatFileSize(Number(asset.fileSize))}
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
