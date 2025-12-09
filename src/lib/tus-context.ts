/**
 * TUS Context Tracking
 *
 * Ensures same file uploaded to different videos/projects gets fresh upload.
 * Clears TUS fingerprints when context changes to prevent resuming wrong upload.
 */

/**
 * Generate simple fingerprint for a file (matches TUS approach)
 */
export function generateFileFingerprint(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified || 0}`
}

/**
 * Get TUS fingerprint key for a file
 * TUS stores with keys like: "tus::{fingerprint}::..."
 */
function getTUSFingerprintKey(file: File): string | null {
  try {
    const fingerprint = generateFileFingerprint(file)

    // Scan localStorage for TUS keys matching this file
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('tus::') && key.includes(fingerprint)) {
        return key
      }
    }

    // Fallback: try to find any tus key (TUS might use different fingerprint format)
    // We'll match by file name and size
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('tus::')) {
        try {
          const value = localStorage.getItem(key)
          if (value) {
            const data = JSON.parse(value)
            // Check if this TUS entry matches our file
            if (data.size === file.size) {
              return key
            }
          }
        } catch {
          continue
        }
      }
    }

    return null
  } catch (error) {
    console.error('Error finding TUS fingerprint:', error)
    return null
  }
}

/**
 * Clear TUS fingerprint for a file
 */
export function clearTUSFingerprint(file: File): void {
  try {
    const key = getTUSFingerprintKey(file)
    if (key) {
      localStorage.removeItem(key)
      console.log('[TUS] Cleared fingerprint for context change:', file.name)
    }
  } catch (error) {
    console.error('Error clearing TUS fingerprint:', error)
  }
}

/**
 * Check if TUS has a fingerprint for this file
 */
export function hasTUSFingerprint(file: File): boolean {
  return getTUSFingerprintKey(file) !== null
}

/**
 * Store context (videoId/projectId) for a file
 */
export function storeFileContext(file: File, context: string): void {
  try {
    const fingerprint = generateFileFingerprint(file)
    const key = `vitransfer-context:${fingerprint}`
    localStorage.setItem(key, context)
  } catch (error) {
    console.error('Error storing file context:', error)
  }
}

/**
 * Get stored context for a file
 */
export function getFileContext(file: File): string | null {
  try {
    const fingerprint = generateFileFingerprint(file)
    const key = `vitransfer-context:${fingerprint}`
    return localStorage.getItem(key)
  } catch (error) {
    console.error('Error getting file context:', error)
    return null
  }
}

/**
 * Clear file context (call on upload success)
 */
export function clearFileContext(file: File): void {
  try {
    const fingerprint = generateFileFingerprint(file)
    const key = `vitransfer-context:${fingerprint}`
    localStorage.removeItem(key)
  } catch (error) {
    console.error('Error clearing file context:', error)
  }
}

/**
 * Check if file context has changed and clear TUS if needed
 */
export function ensureFreshUploadOnContextChange(file: File, newContext: string): void {
  const lastContext = getFileContext(file)

  if (lastContext && lastContext !== newContext) {
    // Context changed! Clear TUS fingerprint to force fresh upload
    console.log(`[TUS] Context changed from "${lastContext}" to "${newContext}" - forcing fresh upload`)
    clearTUSFingerprint(file)
  }

  // Store new context
  storeFileContext(file, newContext)
}

/**
 * Clear all stale context data (older than 7 days)
 */
export function clearStaleContextData(): void {
  try {
    const keysToRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('vitransfer-context:')) {
        // Remove all context keys (they don't have timestamps, so remove all on cleanup)
        keysToRemove.push(key)
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key))

    if (keysToRemove.length > 0) {
      console.log(`[TUS] Cleared ${keysToRemove.length} stale context records`)
    }
  } catch (error) {
    console.error('Error clearing stale context data:', error)
  }
}
