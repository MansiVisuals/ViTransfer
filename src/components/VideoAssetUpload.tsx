'use client'

import { useState, useRef } from 'react'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Input } from './ui/input'
import { Upload, Pause, Play, X } from 'lucide-react'
import * as tus from 'tus-js-client'
import { formatFileSize } from '@/lib/utils'
import { apiPost, apiDelete } from '@/lib/api-client'
import { ALLOWED_ASSET_EXTENSIONS, ALL_ALLOWED_EXTENSIONS, validateAssetExtension, detectAssetCategory } from '@/lib/asset-validation'

interface VideoAssetUploadProps {
  videoId: string
  onUploadComplete?: () => void
}

const CATEGORY_OPTIONS = [
  { value: '', label: 'Other' },
  { value: 'thumbnail', label: 'Thumbnail (JPG, PNG only)' },
  { value: 'image', label: 'Image' },
  { value: 'audio', label: 'Audio/Music' },
  { value: 'project', label: 'Project File (Premiere, DaVinci, Final Cut)' },
  { value: 'document', label: 'Document' },
]

export function VideoAssetUpload({ videoId, onUploadComplete }: VideoAssetUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<tus.Upload | null>(null)
  const assetIdRef = useRef<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState('')
  const [uploading, setUploading] = useState(false)

  const handleFileSelect = (selectedFile: File | null) => {
    setFile(selectedFile)
    if (selectedFile) {
      const detectedCategory = detectAssetCategory(selectedFile.name)
      setCategory(detectedCategory)
    } else {
      setCategory('')
    }
  }
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadSpeed, setUploadSpeed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  function validateAssetFile(file: File): { valid: boolean; error?: string } {
    if (file.size === 0) {
      return { valid: false, error: 'File is empty' }
    }

    return validateAssetExtension(file.name, category)
  }

  async function handleUpload() {
    if (!file) return

    // Validate file type
    const validation = validateAssetFile(file)
    if (!validation.valid) {
      setError(validation.error || 'Invalid file type')
      return
    }

    setUploading(true)
    setError(null)
    setProgress(0)

    try {
      // Create asset record
      const response = await apiPost(`/api/videos/${videoId}/assets`, {
        fileName: file.name,
        fileSize: file.size,
        category: category || null,
      })

      const { assetId } = response
      assetIdRef.current = assetId

      // Start TUS upload
      const startTime = Date.now()
      let lastLoaded = 0
      let lastTime = startTime

      const upload = new tus.Upload(file, {
        endpoint: '/api/uploads',
        retryDelays: [0, 1000, 3000, 5000, 10000],
        metadata: {
          filename: file.name,
          filetype: file.type || 'application/octet-stream',
          assetId: assetId,
        },
        chunkSize: 90 * 1024 * 1024,
        storeFingerprintForResuming: true,
        removeFingerprintOnSuccess: true,

        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = Math.round((bytesUploaded / bytesTotal) * 100)
          setProgress(percentage)

          // Calculate upload speed
          const now = Date.now()
          const timeDiff = (now - lastTime) / 1000
          const bytesDiff = bytesUploaded - lastLoaded

          if (timeDiff > 0.5) {
            const speedMBps = (bytesDiff / timeDiff) / (1024 * 1024)
            setUploadSpeed(Math.round(speedMBps * 10) / 10)
            lastLoaded = bytesUploaded
            lastTime = now
          }
        },

        onSuccess: () => {
          setUploading(false)
          setProgress(100)
          setFile(null)
          setCategory('')
          uploadRef.current = null
          assetIdRef.current = null
          if (onUploadComplete) {
            onUploadComplete()
          }
        },

        onError: async (error) => {
          let errorMessage = 'Upload failed'

          if (error.message?.includes('NetworkError') || error.message?.includes('Failed to fetch')) {
            errorMessage = 'Network error. Please check your connection and try again.'
          } else if (error.message?.includes('413')) {
            errorMessage = 'File is too large. Please choose a smaller file.'
          } else if (error.message?.includes('401') || error.message?.includes('403')) {
            errorMessage = 'Authentication failed. Please log in again.'
          } else if (error.message?.includes('404')) {
            errorMessage = 'Upload endpoint not found. Check server logs.'
          } else if (error.message?.includes('500')) {
            errorMessage = 'Server error. Check server logs for details.'
          } else if (error.message) {
            errorMessage = error.message
          }

          // Clean up asset record on error
          if (assetIdRef.current) {
            try {
              await apiDelete(`/api/videos/${videoId}/assets/${assetIdRef.current}`)
              assetIdRef.current = null
            } catch {}
          }

          setError(errorMessage)
          setUploading(false)
        },

        onBeforeRequest: (req) => {
          const xhr = req.getUnderlyingObject()
          xhr.withCredentials = true
        },
      })

      uploadRef.current = upload
      upload.start()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setUploading(false)
    }
  }

  function handlePauseResume() {
    if (!uploadRef.current) return

    if (paused) {
      uploadRef.current.start()
      setPaused(false)
    } else {
      uploadRef.current.abort()
      setPaused(true)
    }
  }

  async function handleCancel() {
    if (uploadRef.current) {
      uploadRef.current.abort(true)
      uploadRef.current = null
    }

    // Clean up asset record
    if (assetIdRef.current) {
      try {
        await apiDelete(`/api/videos/${videoId}/assets/${assetIdRef.current}`)
        assetIdRef.current = null
      } catch {}
    }

    setUploading(false)
    setPaused(false)
    setProgress(0)
    setUploadSpeed(0)
    setError(null)
  }

  // Drag and drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!uploading) {
      setIsDragging(true)
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (!uploading && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0]
      handleFileSelect(droppedFile)
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        space-y-4 rounded-lg border-2 border-dashed transition-all
        ${isDragging
          ? 'border-primary bg-primary/5 scale-[1.01] p-4'
          : 'border-transparent'
        }
      `}
    >
      {/* Error Message */}
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive rounded-md">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Category Selection */}
      <div className="space-y-2">
        <Label htmlFor={`category-${videoId}`}>Category (Optional)</Label>
        <select
          id={`category-${videoId}`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={uploading}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* File Selection */}
      <div className="space-y-2">
        <Label htmlFor={`asset-file-${videoId}`}>Asset File</Label>
        <div className="flex items-center gap-2">
          <Input
            ref={fileInputRef}
            id={`asset-file-${videoId}`}
            type="file"
            onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
            disabled={uploading}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full"
          >
            <Upload className="w-4 h-4 mr-2" />
            {file ? 'Change File' : 'Drag & Drop or Click to Choose'}
          </Button>
        </div>
        {file && (
          <p className="text-sm text-muted-foreground">
            Selected: {file.name} ({formatFileSize(file.size)})
          </p>
        )}
      </div>

      {/* Upload Button */}
      {file && !uploading && (
        <Button
          type="button"
          onClick={handleUpload}
          className="w-full"
        >
          <Upload className="w-4 h-4 mr-2" />
          Start Upload
        </Button>
      )}

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span>
              {paused ? 'Paused' : 'Uploading...'}
            </span>
            <span className="font-medium">{progress}%</span>
          </div>
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${progress}%`,
                backgroundImage: paused ? 'none' : 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.2) 10px, rgba(255,255,255,0.2) 20px)',
                backgroundSize: '28px 28px',
                animation: paused ? 'none' : 'move-stripes 1s linear infinite'
              }}
            />
          </div>
          {uploadSpeed > 0 && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Speed: {uploadSpeed} MB/s</span>
              <span>
                {progress < 100 && !paused && `Estimated: ${Math.ceil((file!.size / (1024 * 1024)) / uploadSpeed - (file!.size * progress / 100 / (1024 * 1024)) / uploadSpeed)} seconds`}
              </span>
            </div>
          )}
          {/* Pause/Resume and Cancel buttons */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePauseResume}
              className="flex-1"
            >
              {paused ? (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Pause
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              className="flex-1"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
