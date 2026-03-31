import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { getCpuAllocation } from './cpu-config'
import { logError, logMessage } from './logging'

// Debug mode - outputs verbose FFmpeg logs
// Enable with: DEBUG_WORKER=true environment variable
const DEBUG = process.env.DEBUG_WORKER === 'true'

// Use system-installed ffmpeg (installed via apk in Dockerfile)
const ffmpegPath = 'ffmpeg'
const ffprobePath = 'ffprobe'

export interface VideoMetadata {
  duration: number
  width: number
  height: number
  fps?: number
  codec?: string
}

/**
 * Validate and sanitize watermark text for FFmpeg
 * Defense-in-depth: validates even if upstream validation exists
 *
 * @param text - The watermark text to validate
 * @returns Sanitized text safe for FFmpeg
 * @throws Error if text contains invalid characters or exceeds length limit
 */
function validateAndSanitizeWatermarkText(text: string): string {
  // Length check (prevent excessively long watermarks)
  if (text.length > 100) {
    throw new Error('Watermark text exceeds 100 character limit')
  }

  // Check for invalid characters (only alphanumeric, spaces, and safe punctuation)
  const invalidChars = text.match(/[^a-zA-Z0-9\s\-_.()]/g)
  if (invalidChars) {
    const uniqueInvalid = [...new Set(invalidChars)].join(', ')
    throw new Error(`Watermark text contains invalid characters: ${uniqueInvalid}`)
  }

  // Sanitize by removing any potentially dangerous characters (should be none at this point)
  const sanitized = text.replace(/[^a-zA-Z0-9\s\-_.()]/g, '')

  // Escape for FFmpeg drawtext filter (defense-in-depth)
  // Escape all special characters that FFmpeg might interpret
  return sanitized
    .replace(/\\/g, '\\\\')  // Backslash first (prevents double-escaping)
    .replace(/'/g, "\\'")    // Single quote
    .replace(/:/g, '\\:')    // Colon (used in filter syntax)
    .replace(/%/g, '\\%')    // Percent (used in FFmpeg expressions)
    .replace(/\[/g, '\\[')   // Square brackets (used in filter syntax)
    .replace(/\]/g, '\\]')
}

export async function getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    // Remove '-v quiet' to capture detailed error messages
    const args = [
      '-v', 'verbose', // Enable verbose logging for debug
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputPath
    ]

    if (DEBUG) {
      logMessage('[FFPROBE DEBUG] Executing:', ffprobePath, args.join(' '))
      logMessage('[FFPROBE DEBUG] Input file:', inputPath)
    }

    const ffprobe = spawn(ffprobePath, args)
    let stdout = ''
    let stderr = ''

    ffprobe.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      if (DEBUG) {
        logMessage('[FFPROBE STDOUT]', text.trim())
      }
    })

    ffprobe.stderr.on('data', (data) => {
      const text = data.toString()
      stderr += text
      if (DEBUG) {
        logMessage('[FFPROBE STDERR]', text.trim())
      }
    })

    ffprobe.on('close', (code) => {
      if (DEBUG) {
        logMessage('[FFPROBE DEBUG] Process exited with code:', code)
      }

      if (code !== 0) {
        // Extract useful error information from stderr
        const errorLines = stderr.split('\n').filter(line =>
          line.includes('error') ||
          line.includes('Error') ||
          line.includes('Invalid') ||
          line.includes('not found') ||
          line.includes('moov atom')
        )

        const errorMessage = errorLines.length > 0
          ? errorLines.join('; ')
          : stderr || 'Unknown error'

        if (DEBUG) {
          logError('[FFPROBE DEBUG] Error detected:', errorMessage)
        }

        reject(new Error(
          `ffprobe failed with exit code ${code}: ${errorMessage}. ` +
          `This usually indicates a corrupted or incomplete video file.`
        ))
        return
      }

      try {
        const metadata = JSON.parse(stdout)
        const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video')

        if (DEBUG) {
          logMessage('[FFPROBE DEBUG] Parsed metadata:', JSON.stringify(metadata, null, 2))
        }

        if (!videoStream) {
          if (DEBUG) {
            logError('[FFPROBE DEBUG] No video stream found in metadata')
          }
          reject(new Error('No video stream found in file. The file may be audio-only or corrupted.'))
          return
        }

        // Parse frame rate
        let fps: number | undefined
        if (videoStream.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number)
          fps = den ? num / den : undefined
        }

        const result = {
          duration: parseFloat(metadata.format.duration) || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps,
          codec: videoStream.codec_name,
        }

        if (DEBUG) {
          logMessage('[FFPROBE DEBUG] Extracted video metadata:', result)
        }

        resolve(result)
      } catch (error) {
        if (DEBUG) {
          logError('[FFPROBE DEBUG] Failed to parse output:', error)
        }
        reject(new Error(`Failed to parse ffprobe output: ${error}. Output was: ${stdout.substring(0, 200)}`))
      }
    })

    ffprobe.on('error', (err) => {
      reject(new Error(`Failed to spawn ffprobe: ${err.message}. Is ffprobe installed?`))
    })
  })
}

export type WatermarkPosition = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type WatermarkFontSize = 'small' | 'medium' | 'large'

export interface TranscodeOptions {
  inputPath: string
  outputPath: string
  width: number
  height: number
  watermarkText?: string
  watermarkPositions?: string // comma-separated positions, e.g. "center,bottom-right"
  watermarkOpacity?: number // 10-100
  watermarkFontSize?: WatermarkFontSize
  applyLut?: boolean // Apply preview LUT for color-calibrated previews (default: true)
  onProgress?: (progress: number) => void
}

export async function transcodeVideo(options: TranscodeOptions): Promise<void> {
  const {
    inputPath,
    outputPath,
    width,
    height,
    watermarkText,
    onProgress
  } = options

  if (DEBUG) {
    logMessage('[FFMPEG DEBUG] Starting transcodeVideo with options:', {
      inputPath,
      outputPath,
      width,
      height,
      watermarkText,
      hasProgressCallback: !!onProgress
    })
  }

  // Get CPU allocation from centralized config
  // This coordinates with worker concurrency to prevent CPU overload
  const cpuAllocation = getCpuAllocation()
  const threads = cpuAllocation.threadsPerJob

  // Optimize preset based on available threads
  // Fewer threads = faster preset to compensate
  let preset = 'fast'
  if (threads <= 2) {
    preset = 'faster'
  } else if (threads <= 4) {
    preset = 'fast'
  } else {
    preset = 'medium'
  }

  if (DEBUG) {
    logMessage('[FFMPEG DEBUG] CPU optimization:', {
      totalThreads: cpuAllocation.totalThreads,
      threadsPerJob: threads,
      selectedPreset: preset
    })
  }

  // Get video metadata for duration (needed for progress calculation)
  const metadata = await getVideoMetadata(inputPath)
  const duration = metadata.duration

  if (DEBUG) {
    logMessage('[FFMPEG DEBUG] Input video metadata:', metadata)
  }

  // Build video filters
  const filters: string[] = []

  // Scale video
  filters.push(`scale=${width}:${height}`)

  // Add watermark if specified
  let watermarkTextFile: string | null = null
  if (watermarkText) {
    // Validate and sanitize watermark text (defense-in-depth)
    const validatedText = validateAndSanitizeWatermarkText(watermarkText)

    // SECURITY: Write watermark to secure temp directory instead of inline
    // mkdtempSync creates a directory with restricted permissions (0700)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watermark-'))
    watermarkTextFile = path.join(tmpDir, 'text.txt')
    fs.writeFileSync(watermarkTextFile, validatedText, 'utf-8')

    // Parse positions (comma-separated, default: center)
    const positionsStr = options.watermarkPositions || 'center'
    const positions = positionsStr.split(',').map(p => p.trim()).filter(Boolean) as WatermarkPosition[]

    // Convert opacity 10-100 to FFmpeg alpha 0.1-1.0
    const rawOpacity = Math.max(10, Math.min(100, options.watermarkOpacity ?? 30))
    const alpha = (rawOpacity / 100).toFixed(2)
    const shadowAlpha = (rawOpacity / 200).toFixed(2)

    // Font size multipliers relative to video width
    const fontSize = options.watermarkFontSize || 'medium'
    const isVertical = height > width
    const sizeMultipliers = {
      small:  { center: isVertical ? 0.05 : 0.025, corner: isVertical ? 0.035 : 0.018 },
      medium: { center: isVertical ? 0.08 : 0.04,  corner: isVertical ? 0.05  : 0.025 },
      large:  { center: isVertical ? 0.12 : 0.06,  corner: isVertical ? 0.07  : 0.035 },
    }
    const multiplier = sizeMultipliers[fontSize] || sizeMultipliers.medium
    const centerFontPx = Math.round(width * multiplier.center)
    const cornerFontPx = Math.round(width * multiplier.corner)

    const spacing = isVertical ? 30 : 50
    const font = `/usr/share/fonts/dejavu/DejaVuSans.ttf`

    // Position coordinate map
    const positionMap: Record<WatermarkPosition, { x: string; y: string; fs: number; shadow: number }> = {
      'center':       { x: '(w-text_w)/2', y: '(h-text_h)/2', fs: centerFontPx, shadow: 2 },
      'top-left':     { x: `${spacing}`, y: `${spacing}`, fs: cornerFontPx, shadow: 1 },
      'top-right':    { x: `w-text_w-${spacing}`, y: `${spacing}`, fs: cornerFontPx, shadow: 1 },
      'bottom-left':  { x: `${spacing}`, y: `h-text_h-${spacing}`, fs: cornerFontPx, shadow: 1 },
      'bottom-right': { x: `w-text_w-${spacing}`, y: `h-text_h-${spacing}`, fs: cornerFontPx, shadow: 1 },
    }

    for (const pos of positions) {
      const coords = positionMap[pos]
      if (!coords) continue
      filters.push(
        `drawtext=textfile='${watermarkTextFile}':fontfile=${font}:fontsize=${coords.fs}:fontcolor=white@${alpha}:x=${coords.x}:y=${coords.y}:shadowcolor=black@${shadowAlpha}:shadowx=${coords.shadow}:shadowy=${coords.shadow}`
      )
    }
  }

  // Apply preview LUT unless explicitly disabled.
  // Convert to BT.709 limited-range yuv420p first — this matches what a decoded
  // H.264 proxy would look like, which is what the LUT was calibrated against.
  // Then apply the LUT to those normalised values as the very last step.
  if (options.applyLut !== false) {
    filters.push('format=yuv420p')
    filters.push('lut3d=/usr/share/ffmpeg/previewlut.cube')
  }

  const filterComplex = filters.join(',')

  if (DEBUG) {
    logMessage('[FFMPEG DEBUG] Built filter complex:', filterComplex)
  }

  // Build ffmpeg arguments with optimizations
  const args = [
    '-v', 'verbose', // Enable verbose logging for debug
    '-i', inputPath,
    '-vf', filterComplex,
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', '23', // Constant Rate Factor: 18-28 range (lower = better quality, 23 is default)
    '-threads', threads.toString(),
    '-profile:v', 'high',
    '-level', '4.1',
    '-pix_fmt', 'yuv420p', // Ensure compatibility with all players (especially Safari/iOS)
    '-c:a', 'aac',
    '-b:a', '128k', // Reduced from 192k to 128k (sufficient for most use cases, saves bandwidth)
    '-ar', '48000', // Standard audio sample rate
    '-movflags', '+faststart', // Enable progressive download (moov atom at start)
    '-max_muxing_queue_size', '1024', // Prevent muxing errors on high-bitrate videos
    '-progress', 'pipe:2',
    '-y', // Overwrite output file
    outputPath
  ]

  if (DEBUG) {
    logMessage('[FFMPEG DEBUG] Executing command:', 'nice -n 10', ffmpegPath, args.join(' '))
  }

  return new Promise((resolve, reject) => {
    // Run FFmpeg with lower CPU priority (nice 10) to prevent system freeze
    // This allows other processes to remain responsive during video processing
    // nice values: -20 (highest priority) to 19 (lowest priority), default is 0
    const ffmpeg = spawn('nice', ['-n', '10', ffmpegPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''

    if (DEBUG) {
      logMessage('[FFMPEG DEBUG] FFmpeg process spawned, PID:', ffmpeg.pid)
    }

    ffmpeg.stderr.on('data', (data) => {
      const text = data.toString()
      stderr += text

      // In debug mode, log all stderr output
      if (DEBUG) {
        logMessage('[FFMPEG STDERR]', text.trim())
      }

      // Parse progress from stderr
      if (onProgress && duration > 0) {
        const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10)
          const minutes = parseInt(timeMatch[2], 10)
          const seconds = parseFloat(timeMatch[3])
          const currentTime = hours * 3600 + minutes * 60 + seconds
          const progress = Math.min(currentTime / duration, 1)
          if (DEBUG) {
            logMessage('[FFMPEG DEBUG] Progress:', Math.round(progress * 100) + '%')
          }
          onProgress(progress)
        }
      }

      // Log errors and warnings (even when not in debug mode)
      if (!DEBUG && (text.includes('error') || text.includes('Error') || text.includes('failed'))) {
        logError('FFmpeg stderr:', text)
      }
    })

    ffmpeg.on('close', (code) => {
      // Cleanup watermark temp file and directory
      if (watermarkTextFile && fs.existsSync(watermarkTextFile)) {
        try {
          const tmpDir = path.dirname(watermarkTextFile)
          fs.unlinkSync(watermarkTextFile)
          fs.rmdirSync(tmpDir)
          if (DEBUG) {
            logMessage('[FFMPEG DEBUG] Cleaned up watermark temp file:', watermarkTextFile)
          }
        } catch (cleanupErr) {
          logError('Failed to cleanup watermark temp file:', cleanupErr)
        }
      }

      if (DEBUG) {
        logMessage('[FFMPEG DEBUG] Process exited with code:', code)
      }

      if (code === 0) {
        if (DEBUG) {
          logMessage('[FFMPEG DEBUG] Transcoding completed successfully')
        }
        resolve()
      } else {
        if (DEBUG) {
          logError('[FFMPEG DEBUG] Transcoding failed with code:', code)
          logError('[FFMPEG DEBUG] Full stderr output:', stderr)
        }
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`))
      }
    })

    ffmpeg.on('error', (err) => {
      // Cleanup watermark temp file and directory on error
      if (watermarkTextFile && fs.existsSync(watermarkTextFile)) {
        try {
          const tmpDir = path.dirname(watermarkTextFile)
          fs.unlinkSync(watermarkTextFile)
          fs.rmdirSync(tmpDir)
        } catch (cleanupErr) {
          logError('Failed to cleanup watermark temp file:', cleanupErr)
        }
      }

      if (DEBUG) {
        logError('[FFMPEG DEBUG] Failed to spawn FFmpeg:', err)
      }
      reject(new Error(`Failed to start FFmpeg: ${err.message}`))
    })
  })
}

export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  timestamp: number = 10
): Promise<void> {
  if (DEBUG) {
    logMessage('[FFMPEG DEBUG] Starting generateThumbnail:', {
      inputPath,
      outputPath,
      timestamp
    })
  }

  const args = [
    '-v', 'verbose', // Enable verbose logging for debug
    '-ss', timestamp.toString(), // Seek before input (faster - avoids decoding entire video)
    '-i', inputPath,
    '-vframes', '1', // Extract single frame
    '-vf', 'scale=w=min(1280\\,iw):h=min(720\\,ih):force_original_aspect_ratio=decrease', // Scale down if needed, preserve aspect ratio, no padding
    '-q:v', '2', // High quality JPEG (1-31 scale, 2 = excellent quality)
    '-y', // Overwrite output file
    outputPath
  ]

  if (DEBUG) {
    logMessage('[FFMPEG DEBUG] Thumbnail command:', 'nice -n 10', ffmpegPath, args.join(' '))
  }

  return new Promise((resolve, reject) => {
    // Run with lower CPU priority to keep system responsive
    const ffmpeg = spawn('nice', ['-n', '10', ffmpegPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''

    if (DEBUG) {
      logMessage('[FFMPEG DEBUG] Thumbnail process spawned, PID:', ffmpeg.pid)
    }

    ffmpeg.stderr.on('data', (data) => {
      const text = data.toString()
      stderr += text
      if (DEBUG) {
        logMessage('[FFMPEG THUMBNAIL STDERR]', text.trim())
      }
    })

    ffmpeg.on('close', (code) => {
      if (DEBUG) {
        logMessage('[FFMPEG DEBUG] Thumbnail process exited with code:', code)
      }

      if (code === 0) {
        if (DEBUG) {
          logMessage('[FFMPEG DEBUG] Thumbnail generated successfully')
        }
        resolve()
      } else {
        if (DEBUG) {
          logError('[FFMPEG DEBUG] Thumbnail generation failed:', stderr)
        }
        reject(new Error(`FFmpeg thumbnail generation failed: ${stderr}`))
      }
    })

    ffmpeg.on('error', (err) => {
      if (DEBUG) {
        logError('[FFMPEG DEBUG] Failed to spawn FFmpeg for thumbnail:', err)
      }
      reject(new Error(`Failed to start FFmpeg: ${err.message}`))
    })
  })
}
