/**
 * Timecode utility functions
 * Format: HH:MM:SS:FF (e.g., "00:00:32:15" for 32 seconds 15 frames)
 */

/**
 * Convert timecode string to total seconds
 * @param timecode - HH:MM:SS:FF format (e.g., "00:00:32:15")
 * @param fps - Frames per second of the video
 * @returns Total seconds as a float
 */
export function timecodeToSeconds(timecode: string, fps: number = 24): number {
  const parts = timecode.split(':')
  if (parts.length !== 4) {
    throw new Error(`Invalid timecode format: ${timecode}. Expected HH:MM:SS:FF`)
  }

  const hours = parseInt(parts[0]) || 0
  const minutes = parseInt(parts[1]) || 0
  const seconds = parseInt(parts[2]) || 0
  const frames = parseInt(parts[3]) || 0

  return hours * 3600 + minutes * 60 + seconds + (frames / fps)
}

/**
 * Convert seconds to timecode string
 * @param seconds - Total seconds (can include fractional seconds for frames)
 * @param fps - Frames per second of the video
 * @returns Timecode in HH:MM:SS:FF format
 */
export function secondsToTimecode(seconds: number, fps: number = 24): string {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
    return '00:00:00:00'
  }

  const totalFrames = Math.round(seconds * fps)
  const roundedFps = Math.round(fps)
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

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(Math.floor(frames)).padStart(2, '0')}`
}

/**
 * Validate timecode format
 * @param timecode - String to validate
 * @returns True if valid HH:MM:SS:FF format
 */
export function isValidTimecode(timecode: string): boolean {
  const timecodeRegex = /^\d{2}:\d{2}:\d{2}:\d{2}$/
  if (!timecodeRegex.test(timecode)) {
    return false
  }

  const parts = timecode.split(':').map(Number)
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
 * Format timecode for display (always show full HH:MM:SS:FF)
 * @param timecode - HH:MM:SS:FF format
 * @returns Formatted timecode for display
 */
export function formatTimecodeDisplay(
  timecode: string,
  _showFrames: boolean = false,
  _showHours: boolean = false
): string {
  const parts = timecode.split(':')
  if (parts.length !== 4) return timecode

  const [hours, minutes, seconds, frames] = parts.map(part => part.padStart(2, '0'))

  return `${hours}:${minutes}:${seconds}:${frames}`
}
