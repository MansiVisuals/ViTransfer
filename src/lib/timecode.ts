/**
 * Timecode utility functions
 * Supports both drop-frame (DF) and non-drop-frame (NDF) timecode
 *
 * Format:
 * - Non-drop-frame: HH:MM:SS:FF (e.g., "00:00:32:15") - uses colons
 * - Drop-frame: HH:MM:SS;FF (e.g., "00:00:32;15") - uses semicolon before frames
 *
 * Drop-frame is used for 29.97fps and 59.94fps to maintain sync with real-world time
 */

/**
 * Determine if a frame rate should use drop-frame timecode
 * @param fps - Frames per second
 * @returns True if drop-frame should be used
 */
export function isDropFrame(fps: number): boolean {
  // Drop-frame is used for 29.97 and 59.94 fps (NTSC rates)
  const rounded = Math.round(fps * 100) / 100
  return rounded === 29.97 || rounded === 59.94
}

/**
 * Convert timecode string to total seconds
 * Supports both drop-frame (;) and non-drop-frame (:) formats
 * @param timecode - HH:MM:SS:FF or HH:MM:SS;FF format
 * @param fps - Frames per second of the video
 * @returns Total seconds as a float
 */
export function timecodeToSeconds(timecode: string, fps: number = 24): number {
  // Accept both : and ; as separator before frames
  const normalized = timecode.replace(';', ':')
  const parts = normalized.split(':')

  if (parts.length !== 4) {
    throw new Error(`Invalid timecode format: ${timecode}. Expected HH:MM:SS:FF or HH:MM:SS;FF`)
  }

  const hours = parseInt(parts[0]) || 0
  const minutes = parseInt(parts[1]) || 0
  const seconds = parseInt(parts[2]) || 0
  const frames = parseInt(parts[3]) || 0

  const useDropFrame = isDropFrame(fps)

  if (useDropFrame) {
    // Drop-frame calculation: compensate for dropped frame numbers
    const dropFrames = Math.round(fps * 0.066666) // 2 frames for 29.97, 4 frames for 59.94

    const totalMinutes = hours * 60 + minutes
    const droppedFrames = dropFrames * (totalMinutes - Math.floor(totalMinutes / 10))

    const totalFrames =
      (hours * 60 * 60 * Math.round(fps)) +
      (minutes * 60 * Math.round(fps)) +
      (seconds * Math.round(fps)) +
      frames -
      droppedFrames

    return totalFrames / fps
  } else {
    // Non-drop-frame: frame-count based conversion (consistent with DF path)
    const roundedFps = Math.round(fps)
    const totalFrames = hours * 3600 * roundedFps + minutes * 60 * roundedFps + seconds * roundedFps + frames
    return totalFrames / fps
  }
}

/**
 * Convert seconds to timecode string
 * Automatically uses drop-frame format for 29.97/59.94 fps
 * @param seconds - Total seconds (can include fractional seconds for frames)
 * @param fps - Frames per second of the video
 * @returns Timecode in HH:MM:SS:FF (NDF) or HH:MM:SS;FF (DF) format
 */
export function secondsToTimecode(seconds: number, fps: number = 24): string {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
    return '00:00:00:00'
  }

  const useDropFrame = isDropFrame(fps)
  const roundedFps = Math.round(fps)
  const totalFrames = Math.round(seconds * fps)

  if (useDropFrame) {
    // Drop-frame: convert actual frame count back to display frame number
    // using the standard SMPTE algorithm
    const D = Math.round(fps * 0.066666) // 2 for 29.97, 4 for 59.94
    const framesPerMin = roundedFps * 60
    const actualFramesPerMin = framesPerMin - D
    const framesPer10Min = framesPerMin * 10
    const actualFramesPer10Min = framesPer10Min - (D * 9)

    // Count complete 10-minute chunks (no drops at 10-min boundaries)
    const tenMinChunks = Math.floor(totalFrames / actualFramesPer10Min)
    let remainder = totalFrames % actualFramesPer10Min

    // Build display frame number by adding back dropped frame numbers
    let displayFrame = tenMinChunks * framesPer10Min

    if (remainder < framesPerMin) {
      // First minute of 10-min chunk (minute 0 has no drops)
      displayFrame += remainder
    } else {
      // Subtract and add back first minute
      remainder -= framesPerMin
      displayFrame += framesPerMin

      // Count subsequent minutes (each has actualFramesPerMin actual frames)
      const additionalMinutes = Math.floor(remainder / actualFramesPerMin)
      const framesIntoMinute = remainder % actualFramesPerMin

      // Add display frames for complete minutes + dropped frames for current minute
      displayFrame += additionalMinutes * framesPerMin
      displayFrame += D + framesIntoMinute
    }

    // Decompose display frame into HH:MM:SS;FF
    const frames = displayFrame % roundedFps
    const secs = Math.floor(displayFrame / roundedFps) % 60
    const minutes = Math.floor(displayFrame / (roundedFps * 60)) % 60
    const hours = Math.floor(displayFrame / (roundedFps * 3600))

    // Use semicolon before frames for drop-frame
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')};${String(frames).padStart(2, '0')}`
  } else {
    // Non-drop-frame: decompose using roundedFps consistently (matching DF path)
    const frames = totalFrames % roundedFps
    const totalDisplaySeconds = Math.floor(totalFrames / roundedFps)

    const hours = Math.floor(totalDisplaySeconds / 3600)
    const minutes = Math.floor((totalDisplaySeconds % 3600) / 60)
    const secs = totalDisplaySeconds % 60

    // Use colons throughout for non-drop-frame
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
  }
}

/**
 * Validate timecode format
 * Accepts both drop-frame (;) and non-drop-frame (:) formats
 * @param timecode - String to validate
 * @returns True if valid HH:MM:SS:FF or HH:MM:SS;FF format
 */
export function isValidTimecode(timecode: string): boolean {
  // Accept both : (NDF) and ; (DF) before frame count
  const timecodeRegex = /^\d{2}:\d{2}:\d{2}[:;]\d{2}$/
  if (!timecodeRegex.test(timecode)) {
    return false
  }

  // Normalize semicolon to colon for parsing
  const normalized = timecode.replace(';', ':')
  const parts = normalized.split(':').map(Number)
  const [_hours, minutes, seconds, frames] = parts

  // Validate ranges
  if (minutes >= 60 || seconds >= 60) {
    return false
  }

  // Frames should be less than FPS (we'll assume max 120 FPS for validation)
  if (frames >= 120) {
    return false
  }

  return true
}

/**
 * Parse timecode from user input (flexible format)
 * Accepts: HH:MM:SS:FF, HH:MM:SS, MM:SS, or SS
 * @param input - User input string
 * @param fps - Frames per second (default 24)
 * @returns Normalized timecode in HH:MM:SS:FF format
 */
export function parseTimecodeInput(input: string, fps: number = 24): string {
  const parts = input.split(':')

  if (parts.length === 4) {
    // Already in HH:MM:SS:FF format
    return input
  } else if (parts.length === 3) {
    // HH:MM:SS format - add :00 frames
    return `${input}:00`
  } else if (parts.length === 2) {
    // MM:SS format - add hours and frames
    return `00:${input}:00`
  } else if (parts.length === 1) {
    // Just seconds - add hours, minutes, and frames
    const secs = parseInt(parts[0]) || 0
    return secondsToTimecode(secs, fps)
  }

  throw new Error(`Invalid timecode input: ${input}`)
}

/**
 * Get timecode format label (DF or NDF)
 * @param fps - Frames per second
 * @returns "DF" for drop-frame, "NDF" for non-drop-frame
 */
export function getTimecodeLabel(fps: number): string {
  return isDropFrame(fps) ? 'DF' : 'NDF'
}

/**
 * Convert timecode string to seconds with a half-frame offset for seeking.
 * Landing in the middle of the target frame prevents browser seek imprecision
 * from snapping to the previous frame.
 * @param timecode - HH:MM:SS:FF or HH:MM:SS;FF format
 * @param fps - Frames per second of the video
 * @returns Total seconds targeting the center of the frame
 */
export function timecodeToSeekSeconds(timecode: string, fps: number = 24): number {
  const halfFrame = 1 / (fps * 2)
  return timecodeToSeconds(timecode, fps) + halfFrame
}

/**
 * Format timecode for display with proper separator
 * Automatically detects and preserves drop-frame (;) or non-drop-frame (:) format
 * @param timecode - HH:MM:SS:FF or HH:MM:SS;FF format
 * @returns Formatted timecode for display
 */
export function formatTimecodeDisplay(timecode: string): string {
  // Detect if this is drop-frame (contains semicolon) or non-drop-frame (all colons)
  const isDF = timecode.includes(';')
  const separator = isDF ? ';' : ':'

  // Normalize to parse, then reconstruct with proper separator
  const normalized = timecode.replace(';', ':')
  const parts = normalized.split(':')

  if (parts.length !== 4) return timecode

  const [hours, minutes, seconds, frames] = parts.map(part => part.padStart(2, '0'))

  // Use semicolon before frames for DF, colon for NDF
  return `${hours}:${minutes}:${seconds}${separator}${frames}`
}

function formatClockTime(secondsTotal: number, includeHours: boolean): string {
  const safeSeconds = Number.isFinite(secondsTotal) && secondsTotal > 0 ? Math.floor(secondsTotal) : 0
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60

  if (includeHours) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatCommentTimestamp(params: {
  timecode: string
  fps?: number | null
  videoDurationSeconds?: number | null
  mode: 'TIMECODE' | 'AUTO'
}): string {
  const { timecode, fps, videoDurationSeconds, mode } = params

  if (mode === 'TIMECODE') {
    return formatTimecodeDisplay(timecode)
  }

  try {
    const seconds = timecodeToSeconds(timecode, typeof fps === 'number' && Number.isFinite(fps) ? fps : 24)
    const duration = typeof videoDurationSeconds === 'number' && Number.isFinite(videoDurationSeconds) ? videoDurationSeconds : seconds
    return formatClockTime(seconds, duration >= 3600)
  } catch {
    return '00:00'
  }
}
