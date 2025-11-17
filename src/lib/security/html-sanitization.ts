import DOMPurify from 'isomorphic-dompurify'

/**
 * HTML Sanitization Utilities
 *
 * Server-side HTML sanitization for user-generated content
 * Prevents XSS attacks by stripping malicious HTML/JavaScript
 */

/**
 * Sanitize HTML content for comments
 *
 * Allows: Basic formatting (bold, italic, links, lists, paragraphs)
 * Strips: Scripts, iframes, forms, and all event handlers
 *
 * @param html - Raw HTML content from user
 * @returns Sanitized HTML safe for storage and display
 */
export function sanitizeCommentHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return ''
  }

  // Configure DOMPurify with strict settings
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      // Text formatting
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'mark',
      // Links
      'a',
      // Lists
      'ul', 'ol', 'li',
      // Code (for technical feedback)
      'code', 'pre',
      // Headings (for structured feedback)
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      // Quotes
      'blockquote',
    ],
    ALLOWED_ATTR: [
      'href', // For links
      'title', // For link titles
      'target', // For link targets (will be sanitized below)
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SAFE_FOR_TEMPLATES: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    FORCE_BODY: false,
  })

  // Additional post-processing for links
  // Force external links to open in new tab and add rel=noopener
  const withSafeLinks = clean.replace(
    /<a\s+([^>]*?)href="([^"]*)"([^>]*?)>/gi,
    (match, before, href, after) => {
      // Only apply to external links (not starting with / or #)
      if (!href.startsWith('/') && !href.startsWith('#')) {
        return `<a ${before}href="${href}"${after} target="_blank" rel="noopener noreferrer">`
      }
      return match
    }
  )

  return withSafeLinks.trim()
}

/**
 * Sanitize plain text content (removes all HTML)
 *
 * @param text - Raw text that may contain HTML
 * @returns Plain text with HTML stripped
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return ''
  }

  // Strip all HTML tags
  const clean = DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  })

  return clean.trim()
}

/**
 * Validate comment content length
 *
 * @param content - Comment content
 * @param maxLength - Maximum allowed length (default 10000)
 * @returns True if valid, false if too long
 */
export function validateCommentLength(
  content: string,
  maxLength: number = 10000
): boolean {
  if (!content) return false
  return content.length <= maxLength
}

/**
 * Check if content contains potentially malicious patterns
 * Additional security check beyond DOMPurify
 *
 * @param content - Content to check
 * @returns True if suspicious patterns detected
 */
export function containsSuspiciousPatterns(content: string): boolean {
  if (!content) return false

  const suspiciousPatterns = [
    // JavaScript protocol
    /javascript:/gi,
    // Data URLs (can contain scripts)
    /data:text\/html/gi,
    // VBScript (legacy IE)
    /vbscript:/gi,
    // On event handlers (should be caught by DOMPurify, but double-check)
    /on\w+\s*=/gi,
  ]

  return suspiciousPatterns.some(pattern => pattern.test(content))
}
