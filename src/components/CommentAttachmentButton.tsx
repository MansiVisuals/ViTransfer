'use client'

import { useState, useRef } from 'react'
import { Paperclip, Loader2 } from 'lucide-react'
import { Button } from './ui/button'

interface PendingAttachment {
  assetId: string
  videoId: string
  fileName: string
  fileSize: string
  fileType: string
  category: string
}

interface CommentAttachmentButtonProps {
  videoId: string
  shareToken: string | null
  onAttachmentAdded: (attachment: PendingAttachment) => void
  onUploadError?: (message: string | null) => void
  disabled?: boolean
}

export default function CommentAttachmentButton({
  videoId,
  shareToken,
  onAttachmentAdded,
  onUploadError,
  disabled = false,
}: CommentAttachmentButtonProps) {
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input so the same file can be selected again
    e.target.value = ''
    onUploadError?.(null)

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const headers: Record<string, string> = {}
      if (shareToken) {
        headers['Authorization'] = `Bearer ${shareToken}`
      }

      const response = await fetch(`/api/videos/${videoId}/client-assets`, {
        method: 'POST',
        headers,
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Upload failed')
      }

      const data = await response.json()
      onAttachmentAdded({
        assetId: data.assetId,
        videoId,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
        category: data.category,
      })
    } catch (error) {
      onUploadError?.(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.mp3,.wav,.aac,.flac,.ogg,.m4a,.wma,.mp4,.mov,.avi,.mkv,.mxf,.prores,.srt,.vtt,.ass,.ssa,.sub,.prproj,.aep,.fcp,.drp,.drt,.dra,.zip,.rar,.7z,.pdf,.doc,.docx,.txt,.rtf,.tar,.gz"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={disabled || uploading}
        className="self-end text-muted-foreground hover:text-foreground"
        title="Attach a file"
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Paperclip className="w-4 h-4" />
        )}
      </Button>
    </>
  )
}
