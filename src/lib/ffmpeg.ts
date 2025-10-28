import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

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

export async function getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    // Remove '-v quiet' to capture detailed error messages
    const args = [
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputPath
    ]

    const ffprobe = spawn(ffprobePath, args)
    let stdout = ''
    let stderr = ''

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ffprobe.on('close', (code) => {
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

        reject(new Error(
          `ffprobe failed with exit code ${code}: ${errorMessage}. ` +
          `This usually indicates a corrupted or incomplete video file.`
        ))
        return
      }

      try {
        const metadata = JSON.parse(stdout)
        const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video')

        if (!videoStream) {
          reject(new Error('No video stream found in file. The file may be audio-only or corrupted.'))
          return
        }

        // Parse frame rate
        let fps: number | undefined
        if (videoStream.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number)
          fps = den ? num / den : undefined
        }

        resolve({
          duration: parseFloat(metadata.format.duration) || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps,
          codec: videoStream.codec_name,
        })
      } catch (error) {
        reject(new Error(`Failed to parse ffprobe output: ${error}. Output was: ${stdout.substring(0, 200)}`))
      }
    })

    ffprobe.on('error', (err) => {
      reject(new Error(`Failed to spawn ffprobe: ${err.message}. Is ffprobe installed?`))
    })
  })
}

export interface TranscodeOptions {
  inputPath: string
  outputPath: string
  width: number
  height: number
  watermarkText?: string
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

  const cpuCores = os.cpus().length

  // Optimize preset based on CPU cores and workload
  // - 'ultrafast': 1-2 cores (low-end systems)
  // - 'faster': 3-4 cores (mid-range systems)
  // - 'fast': 5-8 cores (good balance)
  // - 'medium': 9+ cores (best quality/size ratio)
  let preset = 'fast'
  if (cpuCores <= 2) {
    preset = 'ultrafast'
  } else if (cpuCores <= 4) {
    preset = 'faster'
  } else if (cpuCores <= 8) {
    preset = 'fast'
  } else {
    preset = 'medium'
  }

  // IMPORTANT: Limit CPU usage to prevent system freeze
  // Use 50-75% of available cores, leaving headroom for system operations
  // This prevents the system from becoming unresponsive during video processing
  const maxThreads = Math.max(1, Math.floor(cpuCores * 0.75))
  const threads = Math.min(maxThreads, 12) // Cap at 12 threads max

  // Get video metadata for duration (needed for progress calculation)
  const metadata = await getVideoMetadata(inputPath)
  const duration = metadata.duration

  // Build video filters
  const filters: string[] = []

  // Scale video
  filters.push(`scale=${width}:${height}`)

  // Add watermark if specified
  if (watermarkText) {
    const isVertical = height > width
    const centerFontSize = isVertical ? Math.round(width * 0.08) : Math.round(width * 0.04)
    const cornerFontSize = isVertical ? Math.round(width * 0.05) : Math.round(width * 0.025)

    // Escape text for ffmpeg
    const escapedText = watermarkText.replace(/'/g, "\\'").replace(/:/g, "\\:")

    // Center watermark
    filters.push(
      `drawtext=text='${escapedText}':fontfile=/usr/share/fonts/dejavu/DejaVuSans.ttf:fontsize=${centerFontSize}:fontcolor=white@0.3:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black@0.5:shadowx=2:shadowy=2`
    )

    // Corner watermarks
    const spacing = isVertical ? 30 : 50
    filters.push(
      `drawtext=text='${escapedText}':fontfile=/usr/share/fonts/dejavu/DejaVuSans.ttf:fontsize=${cornerFontSize}:fontcolor=white@0.2:x=${spacing}:y=${spacing}:shadowcolor=black@0.3:shadowx=1:shadowy=1`
    )
    filters.push(
      `drawtext=text='${escapedText}':fontfile=/usr/share/fonts/dejavu/DejaVuSans.ttf:fontsize=${cornerFontSize}:fontcolor=white@0.2:x=w-text_w-${spacing}:y=h-text_h-${spacing}:shadowcolor=black@0.3:shadowx=1:shadowy=1`
    )
  }

  const filterComplex = filters.join(',')

  // Build ffmpeg arguments with optimizations
  const args = [
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

  return new Promise((resolve, reject) => {
    // Run FFmpeg with lower CPU priority (nice 10) to prevent system freeze
    // This allows other processes to remain responsive during video processing
    // nice values: -20 (highest priority) to 19 (lowest priority), default is 0
    const ffmpeg = spawn('nice', ['-n', '10', ffmpegPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''

    ffmpeg.stderr.on('data', (data) => {
      const text = data.toString()
      stderr += text

      // Parse progress from stderr
      if (onProgress && duration > 0) {
        const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
        if (timeMatch) {
          const hours = parseInt(timeMatch[1])
          const minutes = parseInt(timeMatch[2])
          const seconds = parseFloat(timeMatch[3])
          const currentTime = hours * 3600 + minutes * 60 + seconds
          const progress = Math.min(currentTime / duration, 1)
          onProgress(progress)
        }
      }

      // Log errors and warnings
      if (text.includes('error') || text.includes('Error') || text.includes('failed')) {
        console.error('FFmpeg stderr:', text)
      }
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`))
      }
    })

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`))
    })
  })
}

export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  timestamp: number = 10
): Promise<void> {
  const args = [
    '-ss', timestamp.toString(), // Seek before input (faster - avoids decoding entire video)
    '-i', inputPath,
    '-vframes', '1', // Extract single frame
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2', // Maintain aspect ratio with padding
    '-q:v', '2', // High quality JPEG (1-31 scale, 2 = excellent quality)
    '-y', // Overwrite output file
    outputPath
  ]

  return new Promise((resolve, reject) => {
    // Run with lower CPU priority to keep system responsive
    const ffmpeg = spawn('nice', ['-n', '10', ffmpegPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`FFmpeg thumbnail generation failed: ${stderr}`))
      }
    })

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`))
    })
  })
}
