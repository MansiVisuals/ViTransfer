/**
 * File Upload Security
 * Validates file types and sizes to prevent malicious uploads
 */

// Allowed video MIME types
export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/x-matroska',
  'video/avi'
]

// File configuration
export const FILE_LIMITS = {
  ALLOWED_EXTENSIONS: ['.mp4', '.mov', '.avi', '.webm', '.mkv']
}

// Allowed asset types by category
export const ALLOWED_ASSET_TYPES = {
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'image/svg+xml']
  },
  audio: {
    extensions: ['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma'],
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/flac', 'audio/ogg', 'audio/mp4', 'audio/x-ms-wma']
  },
  project: {
    extensions: ['.prproj', '.aep', '.fcp', '.davinci', '.zip', '.rar', '.7z'],
    mimeTypes: ['application/octet-stream', 'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed']
  },
  document: {
    extensions: ['.pdf', '.doc', '.docx', '.txt', '.rtf'],
    mimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'application/rtf']
  },
  other: {
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz'],
    mimeTypes: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed', 'application/x-tar', 'application/gzip']
  }
}

/**
 * Validate file extension
 */
export function validateFileExtension(filename: string): boolean {
  if (!filename || typeof filename !== 'string') {
    return false
  }

  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))
  return FILE_LIMITS.ALLOWED_EXTENSIONS.includes(ext)
}

/**
 * Validate MIME type
 */
export function validateMimeType(mimeType: string): boolean {
  if (!mimeType || typeof mimeType !== 'string') {
    return false
  }

  return ALLOWED_VIDEO_TYPES.includes(mimeType.toLowerCase())
}


/**
 * Sanitize filename to prevent path traversal and other attacks
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'upload.bin'
  }
  
  // Remove any path components (/, \, :)
  let safe = filename.split(/[/\\:]+/).pop() || 'upload'
  
  // Remove null bytes
  safe = safe.replace(/\x00/g, '')
  
  // Remove control characters
  safe = safe.replace(/[\x00-\x1F\x7F]/g, '')
  
  // Remove leading/trailing dots and spaces
  safe = safe.replace(/^[.\s]+|[.\s]+$/g, '')
  
  // Prevent directory traversal
  safe = safe.replace(/\.\./g, '')
  
  // Limit length while preserving extension
  if (safe.length > 255) {
    const ext = safe.slice(safe.lastIndexOf('.'))
    const name = safe.slice(0, 255 - ext.length)
    safe = name + ext
  }
  
  // Ensure not empty and not just dots
  if (!safe || safe === '.' || safe === '..') {
    safe = 'upload.bin'
  }
  
  // Additional safety: only allow alphanumeric, dash, underscore, dot
  safe = safe.replace(/[^a-zA-Z0-9._-]/g, '_')
  
  return safe
}

/**
 * Check if filename is suspicious
 */
export function isSuspiciousFilename(filename: string): boolean {
  const suspiciousPatterns = [
    /\.exe$/i,
    /\.sh$/i,
    /\.bat$/i,
    /\.cmd$/i,
    /\.com$/i,
    /\.scr$/i,
    /\.pif$/i,
    /\.app$/i,
    /\.deb$/i,
    /\.rpm$/i,
    /\.dmg$/i,
    /\.pkg$/i,
    /\.php$/i,
    /\.asp$/i,
    /\.jsp$/i,
    /\.js$/i,
    /\.vbs$/i,
    /\.ws$/i,
    /\.wsf$/i,
    /\.\./,  // Directory traversal
    /^\.ht/,  // .htaccess, .htpasswd
    /^\.env/, // Environment files
  ]
  
  return suspiciousPatterns.some(pattern => pattern.test(filename))
}

/**
 * Comprehensive file validation
 */
export function validateUploadedFile(
  filename: string,
  mimeType: string,
  size: number
): { valid: boolean; error?: string; sanitizedFilename?: string } {
  // Sanitize filename first
  const sanitizedFilename = sanitizeFilename(filename)

  // Check for suspicious filenames
  if (isSuspiciousFilename(filename)) {
    return {
      valid: false,
      error: 'Filename contains suspicious patterns'
    }
  }

  // Validate extension
  if (!validateFileExtension(sanitizedFilename)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed: ${FILE_LIMITS.ALLOWED_EXTENSIONS.join(', ')}`
    }
  }

  // Validate MIME type
  if (!validateMimeType(mimeType)) {
    return {
      valid: false,
      error: `Invalid MIME type. Allowed: ${ALLOWED_VIDEO_TYPES.join(', ')}`
    }
  }

  return {
    valid: true,
    sanitizedFilename
  }
}

/**
 * Validate asset file (images, audio, documents, etc.)
 */
export function validateAssetFile(
  filename: string,
  mimeType: string,
  category?: string
): { valid: boolean; error?: string; sanitizedFilename?: string; detectedCategory?: string } {
  // Sanitize filename first
  const sanitizedFilename = sanitizeFilename(filename)

  // Check for suspicious filenames
  if (isSuspiciousFilename(filename)) {
    return {
      valid: false,
      error: 'Filename contains suspicious patterns'
    }
  }

  const ext = sanitizedFilename.toLowerCase().slice(sanitizedFilename.lastIndexOf('.'))

  // If category specified, validate against that category
  if (category && category in ALLOWED_ASSET_TYPES) {
    const categoryConfig = ALLOWED_ASSET_TYPES[category as keyof typeof ALLOWED_ASSET_TYPES]

    if (!categoryConfig.extensions.includes(ext)) {
      return {
        valid: false,
        error: `Invalid file type for ${category}. Allowed: ${categoryConfig.extensions.join(', ')}`
      }
    }

    if (!categoryConfig.mimeTypes.includes(mimeType.toLowerCase())) {
      return {
        valid: false,
        error: `Invalid MIME type for ${category}. Allowed: ${categoryConfig.mimeTypes.join(', ')}`
      }
    }

    return {
      valid: true,
      sanitizedFilename,
      detectedCategory: category
    }
  }

  // If no category, detect from extension
  for (const [cat, config] of Object.entries(ALLOWED_ASSET_TYPES)) {
    if (config.extensions.includes(ext) && config.mimeTypes.includes(mimeType.toLowerCase())) {
      return {
        valid: true,
        sanitizedFilename,
        detectedCategory: cat
      }
    }
  }

  // No category matched
  return {
    valid: false,
    error: `Unsupported file type: ${ext}. Please upload images, audio, documents, or project files.`
  }
}

