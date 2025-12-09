'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useRouter } from 'next/navigation'
import { Upload, Pause, Play, X } from 'lucide-react'
import * as tus from 'tus-js-client'
import { formatFileSize } from '@/lib/utils'
import { apiPost, apiDelete } from '@/lib/api-client'
import { getAccessToken } from '@/lib/token-store'
import {
  ensureFreshUploadOnContextChange,
  clearFileContext,
  clearTUSFingerprint,
  getUploadMetadata,
  storeUploadMetadata,
  clearUploadMetadata,
} from '@/lib/tus-context'

interface VideoUploadProps {
  projectId: string
  videoName: string // Required video name for multi-video support
  onUploadComplete?: () => void // Callback when upload completes successfully
}

export default function VideoUpload({ projectId, videoName, onUploadComplete }: VideoUploadProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<tus.Upload | null>(null)
  const videoIdRef = useRef<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadSpeed, setUploadSpeed] = useState(0)
  const [versionLabel, setVersionLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Warn before leaving page if upload is in progress
  useEffect(() => {
    if (uploading || paused) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault()
        e.returnValue = '' // Chrome requires returnValue to be set
        return '' // Some browsers use the return value
      }

      window.addEventListener('beforeunload', handleBeforeUnload)

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
    }
  }, [uploading, paused])

  // Validate video file format
  async function validateVideoFile(file: File): Promise<{ valid: boolean; error?: string }> {
    // Check file size is not zero
    if (file.size === 0) {
      return { valid: false, error: 'File is empty' }
    }

    // Read first 12 bytes to check for MP4/MOV signature
    try {
      const headerBytes = await new Promise<Uint8Array>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          if (e.target?.result) {
            resolve(new Uint8Array(e.target.result as ArrayBuffer))
          } else {
            reject(new Error('Failed to read file'))
          }
        }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsArrayBuffer(file.slice(0, 12))
      })

      // Check for valid MP4/MOV file signature
      // MP4 files start with: 00 00 00 XX 66 74 79 70 (ftyp atom)
      // where XX is the size of the atom (typically 18-20 bytes)
      if (headerBytes.length < 12) {
        return { valid: false, error: 'File is too small to be a valid video' }
      }

      // Check for ftyp atom at position 4-8
      const ftypSignature = String.fromCharCode(...headerBytes.subarray(4, 8))

      if (ftypSignature === 'ftyp') {
        return { valid: true }
      }

      // Also check for mdat atom (some MP4s start with this)
      const mdatSignature = String.fromCharCode(...headerBytes.subarray(4, 8))
      if (mdatSignature === 'mdat') {
        return { valid: true }
      }

      // Check for other valid MP4 atoms
      const validAtoms = ['wide', 'free', 'moov']
      const atomType = String.fromCharCode(...headerBytes.subarray(4, 8))
      if (validAtoms.includes(atomType)) {
        return { valid: true }
      }

      return {
        valid: false,
        error: 'File does not appear to be a valid MP4/MOV video. Please ensure you are uploading an unencrypted, standard MP4 video file.'
      }
    } catch (err) {
      return { valid: false, error: 'Failed to read file. Please try again.' }
    }
  }

  async function handleUpload() {
    if (!file) return

    // Validate video name is provided
    if (!videoName || !videoName.trim()) {
      setError('Video name is required')
      return
    }

    const trimmedVideoName = videoName.trim()
    const trimmedVersionLabel = versionLabel.trim()
    const contextKey = `${projectId}:${trimmedVideoName}:${trimmedVersionLabel || 'auto'}`

    setUploading(true)
    setProgress(0)
    setError(null)

    try {
      // Step 0: Validate file format
      const validation = await validateVideoFile(file)

      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid video file')
      }

      // Check if file was uploaded to different project and clear TUS fingerprint if needed
      ensureFreshUploadOnContextChange(file, contextKey)

      const existingMetadata = getUploadMetadata(file)
      const canResumeExisting =
        existingMetadata?.projectId === projectId &&
        !!existingMetadata.videoId &&
        existingMetadata?.targetName === trimmedVideoName &&
        (existingMetadata.versionLabel || '') === (trimmedVersionLabel || '')
      let createdVideoRecord = false

      // Step 1: Reuse existing video record if we have metadata, otherwise create a new one
      if (canResumeExisting) {
        videoIdRef.current = existingMetadata!.videoId
        // Refresh metadata timestamp so it stays valid
        storeUploadMetadata(file, {
          videoId: existingMetadata!.videoId,
          projectId,
          versionLabel: existingMetadata?.versionLabel || trimmedVersionLabel,
          targetName: trimmedVideoName,
        })
      } else {
        const { videoId } = await apiPost('/api/videos', {
          projectId,
          versionLabel: trimmedVersionLabel,
          originalFileName: file.name,
          originalFileSize: file.size,
          name: trimmedVideoName, // Include video name for multi-video support
        })
        videoIdRef.current = videoId
        createdVideoRecord = true

        storeUploadMetadata(file, {
          videoId,
          projectId,
          versionLabel: trimmedVersionLabel,
          targetName: trimmedVideoName,
        })
      }

      // Step 2: Upload with TUS protocol
      const startTime = Date.now()
      let lastLoaded = 0
      let lastTime = startTime

      const upload = new tus.Upload(file, {
        // TUS server endpoint (absolute URL for fingerprint consistency)
        endpoint: `${window.location.origin}/api/uploads`,

        // Retry configuration - exponential backoff
        retryDelays: [0, 1000, 3000, 5000, 10000],

        // Metadata
        metadata: {
          filename: file.name,
          filetype: file.type || 'video/mp4',
          videoId: videoIdRef.current!,
        },

        chunkSize: 50 * 1024 * 1024,

        // Store upload URL in localStorage for resume after browser close
        storeFingerprintForResuming: true,
        removeFingerprintOnSuccess: true,

        // Ensure auth header is sent for resume/HEAD requests too
        onBeforeRequest: (req) => {
          const xhr = req.getUnderlyingObject()
          const token = getAccessToken()
          if (token) {
            if (xhr?.setRequestHeader) {
              xhr.setRequestHeader('Authorization', `Bearer ${token}`)
            } else {
              req.setHeader('Authorization', `Bearer ${token}`)
            }
          }
        },

        // Progress callback
        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = Math.round((bytesUploaded / bytesTotal) * 100)
          setProgress(percentage)

          // Calculate upload speed
          const now = Date.now()
          const timeDiff = (now - lastTime) / 1000 // seconds
          const bytesDiff = bytesUploaded - lastLoaded

          if (timeDiff > 0.5) { // Update every 0.5 seconds
            const speedMBps = (bytesDiff / timeDiff) / (1024 * 1024)
            const stableSpeed = speedMBps > 0.05 ? Math.round(speedMBps * 10) / 10 : 0
            setUploadSpeed(stableSpeed)
            lastLoaded = bytesUploaded
            lastTime = now
          }
        },

        // Success callback
        onSuccess: () => {
          setUploading(false)
          setProgress(100)

          // Clear file context since upload completed
          clearFileContext(file)
          clearUploadMetadata(file)
          clearTUSFingerprint(file)

          setFile(null)
          setVersionLabel('')
          uploadRef.current = null
          videoIdRef.current = null
          router.refresh()
          // Notify parent component
          onUploadComplete?.()
        },

        // Error callback
        onError: async (error) => {

          // Extract meaningful error message
          let errorMessage = 'Upload failed'
          if (error.message) {
            errorMessage = error.message
          }

          // Check if it's a network error
          if (error.message?.includes('NetworkError') || error.message?.includes('Failed to fetch')) {
            errorMessage = 'Network error. Please check your connection and try again.'
          }

          // Check if it's a server error
          if (error.message?.includes('413')) {
            errorMessage = 'File is too large. Please choose a smaller file.'
          } else if (error.message?.includes('401') || error.message?.includes('403')) {
            errorMessage = 'Authentication failed. Please log in again.'
          } else if (error.message?.includes('404')) {
            errorMessage = 'Upload endpoint not found. Check server logs for configuration issues.'
          } else if (error.message?.includes('500')) {
            errorMessage = 'Server error. Check server logs for details.'
          }

          const statusCode = (error as any)?.originalResponse?.getStatus?.()

          // If we tried to resume an old session and it's gone, clear local resume data
          if (canResumeExisting && (statusCode === 404 || statusCode === 410)) {
            clearUploadMetadata(file)
            clearTUSFingerprint(file)
            errorMessage = 'Upload session expired. Please restart the upload.'
          } else if (createdVideoRecord && videoIdRef.current) {
            // Only clean up DB record if we created it in this attempt
            try {
              await apiDelete(`/api/videos/${videoIdRef.current}`)
              videoIdRef.current = null
            } catch {}
            clearUploadMetadata(file)
            clearTUSFingerprint(file)
          }

          setError(errorMessage)
          setUploading(false)
          uploadRef.current = null
        },
      })

      const previousUploads = await upload.findPreviousUploads()
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0])
      } else if (!createdVideoRecord && canResumeExisting) {
        // We expected to resume but no session exists; clear stale metadata so next attempt starts fresh
        clearUploadMetadata(file)
        clearTUSFingerprint(file)
      }

      // Store upload reference for pause/resume
      uploadRef.current = upload

      // Start the upload
      upload.start()

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Upload failed')
      setUploading(false)
    }
  }

  function handlePauseResume() {
    if (!uploadRef.current) return

    if (paused) {
      // Resume upload
      uploadRef.current.start()
      setPaused(false)
    } else {
      // Pause upload
      uploadRef.current.abort()
      setPaused(true)
    }
  }

  async function handleCancel() {
    if (uploadRef.current) {
      uploadRef.current.abort(true) // true = permanent abort
      uploadRef.current = null
    }

    // Delete the video record from database if it was created
    if (videoIdRef.current) {
      try {
        await apiDelete(`/api/videos/${videoIdRef.current}`)
        videoIdRef.current = null
        router.refresh()
      } catch {}
    }

    setUploading(false)
    setPaused(false)
    setProgress(0)
    setUploadSpeed(0)
    setError(null)
    if (file) {
      clearUploadMetadata(file)
      clearTUSFingerprint(file)
      clearFileContext(file)
    }
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
      // Only accept video files
      if (droppedFile.type.startsWith('video/')) {
        setFile(droppedFile)
      } else {
        setError('Please drop a video file')
      }
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

      {/* Version Label */}
      <div className="space-y-2">
        <Label htmlFor="versionLabel">Version Label (Optional)</Label>
        <Input
          id="versionLabel"
          value={versionLabel}
          onChange={(e) => setVersionLabel(e.target.value)}
          placeholder="Leave empty for auto-generated label (v1, v2, etc.)"
          disabled={uploading}
        />
      </div>

      {/* File Selection */}
      <div className="space-y-2">
        <Label htmlFor="file">Video File (Original)</Label>
        <div className="flex items-center gap-2">
          <Input
            ref={fileInputRef}
            id="file"
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
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

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {paused ? 'Paused' : 'Uploading...'}
            </span>
            <span className="font-medium">{progress}%</span>
          </div>
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full transition-all ${paused ? 'bg-warning' : 'bg-primary'}`}
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

      {/* Upload Button */}
      <Button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full"
      >
        {uploading ? 'Uploading...' : 'Upload Video'}
      </Button>

      <p className="text-xs text-muted-foreground">
        Upload the original file without watermark. Preview versions will be generated
        automatically. Upload can be paused and resumed if interrupted.
      </p>
    </div>
  )
}
