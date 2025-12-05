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
    const framesPerMinute = Math.round(fps) * 60
    const framesPer10Minutes = framesPerMinute * 10

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
    // Non-drop-frame: simple linear conversion
    return hours * 3600 + minutes * 60 + seconds + (frames / fps)
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
    // Drop-frame calculation
    const dropFrames = Math.round(fps * 0.066666) // 2 for 29.97, 4 for 59.94
    const framesPerMinute = roundedFps * 60
    const framesPer10Minutes = framesPerMinute * 10

    // Calculate total 10-minute intervals
    const tenMinuteIntervals = Math.floor(totalFrames / framesPer10Minutes)
    // Frames after the last 10-minute interval
    let remainingFrames = totalFrames % framesPer10Minutes

    // Add back the dropped frames for 10-minute intervals
    let adjustedFrames = totalFrames + (dropFrames * 9 * tenMinuteIntervals)

    // Handle frames within the current 10-minute interval
    if (remainingFrames >= dropFrames) {
      const oneMinuteIntervals = Math.floor((remainingFrames - dropFrames) / framesPerMinute)
      adjustedFrames += dropFrames * oneMinuteIntervals
    }

    // Now convert adjusted frames to time components
    const hours = Math.floor(adjustedFrames / (roundedFps * 60 * 60))
    const minutes = Math.floor((adjustedFrames % (roundedFps * 60 * 60)) / (roundedFps * 60))
    const secs = Math.floor((adjustedFrames % (roundedFps * 60)) / roundedFps)
    const frames = adjustedFrames % roundedFps

    // Use semicolon before frames for drop-frame
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')};${String(Math.floor(frames)).padStart(2, '0')}`
  } else {
    // Non-drop-frame: simple linear conversion
    const totalSeconds = Math.floor(totalFrames / fps)
    let frames = totalFrames - (totalSeconds * roundedFps)

    // Handle edge case where frames might be negative or >= fps due to rounding
    if (frames < 0) {
      frames = 0
    } else if (frames >= roundedFps) {
      frames = roundedFps - 1
    }

    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60

    // Use colons throughout for non-drop-frame
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(Math.floor(frames)).padStart(2, '0')}`
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
  const [hours, minutes, seconds, frames] = parts

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
