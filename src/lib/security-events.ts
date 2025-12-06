/**
 * Security Event Type Definitions and Helpers
 *
 * Centralized definitions for all security event types, their descriptions,
 * and formatting helpers for the security dashboard.
 */

export type SecurityEventType =
  // Admin Login Events
  | 'ADMIN_PASSWORD_LOGIN_SUCCESS'
  | 'ADMIN_PASSWORD_LOGIN_FAILED'
  | 'ADMIN_LOGIN_RATE_LIMIT_HIT'

  // Passkey Events
  | 'PASSKEY_REGISTERED'
  | 'PASSKEY_REGISTRATION_FAILED'
  | 'PASSKEY_LOGIN_SUCCESS'
  | 'PASSKEY_LOGIN_FAILED'
  | 'PASSKEY_DELETE_UNAUTHORIZED'
  | 'PASSKEY_DELETED'

  // Share Page Password Events
  | 'PASSWORD_ACCESS'
  | 'PASSWORD_RATE_LIMIT_HIT'
  | 'FAILED_PASSWORD_ATTEMPT'
  | 'PASSWORD_LOCKOUT'

  // Share Page OTP Events
  | 'OTP_RATE_LIMIT_HIT'
  | 'OTP_SENT'
  | 'OTP_VERIFICATION_FAILED'
  | 'OTP_VERIFICATION_SUCCESS'
  | 'UNAUTHORIZED_OTP_REQUEST'
  | 'GUEST_ACCESS'

  // Video Access Events
  | 'HOTLINK_DETECTED'
  | 'HOTLINK_BLOCKED'
  | 'TOKEN_SESSION_MISMATCH'
  | 'SUSPICIOUS_ACTIVITY'
  | 'BLOCKED_IP_ATTEMPT'
  | 'RATE_LIMIT_HIT'

export type SecurityEventSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export interface SecurityEventMetadata {
  label: string
  description: string
  category: 'Admin Auth' | 'Passkey Auth' | 'Share Auth' | 'Video Access' | 'Security'
  severity: SecurityEventSeverity
}

/**
 * Security event metadata for UI display
 */
export const SECURITY_EVENT_METADATA: Record<SecurityEventType, SecurityEventMetadata> = {
  // Admin Login Events
  ADMIN_PASSWORD_LOGIN_SUCCESS: {
    label: 'Admin Basic Auth Login Success',
    description: 'Administrator successfully logged in using username/email and password.',
    category: 'Admin Auth',
    severity: 'INFO',
  },
  ADMIN_PASSWORD_LOGIN_FAILED: {
    label: 'Admin Basic Auth Login Failed',
    description: 'Failed administrator login attempt - incorrect username/email or password.',
    category: 'Admin Auth',
    severity: 'WARNING',
  },
  ADMIN_LOGIN_RATE_LIMIT_HIT: {
    label: 'Admin Login Rate Limited',
    description: 'Too many failed admin login attempts - account temporarily locked for security.',
    category: 'Admin Auth',
    severity: 'WARNING',
  },

  // Passkey Events
  PASSKEY_REGISTERED: {
    label: 'Passkey Registered',
    description: 'New passkey (biometric or security key) successfully registered to user account.',
    category: 'Passkey Auth',
    severity: 'INFO',
  },
  PASSKEY_REGISTRATION_FAILED: {
    label: 'Passkey Registration Failed',
    description: 'Failed to register passkey - verification error or invalid credential.',
    category: 'Passkey Auth',
    severity: 'WARNING',
  },
  PASSKEY_LOGIN_SUCCESS: {
    label: 'Admin Passkey Auth Login Success',
    description: 'Administrator successfully authenticated using passkey (biometric or security key).',
    category: 'Admin Auth',
    severity: 'INFO',
  },
  PASSKEY_LOGIN_FAILED: {
    label: 'Admin Passkey Auth Login Failed',
    description: 'Admin passkey authentication failed - invalid credential, expired challenge, or verification error.',
    category: 'Admin Auth',
    severity: 'WARNING',
  },
  PASSKEY_DELETE_UNAUTHORIZED: {
    label: 'Unauthorized Passkey Deletion',
    description: 'Attempted to delete a passkey without proper authorization or ownership.',
    category: 'Passkey Auth',
    severity: 'WARNING',
  },
  PASSKEY_DELETED: {
    label: 'Passkey Deleted',
    description: 'Passkey credential successfully removed from user account.',
    category: 'Passkey Auth',
    severity: 'INFO',
  },

  // Share Page Password Events
  PASSWORD_ACCESS: {
    label: 'Share Password Auth Login Success',
    description: 'Share page access granted after valid password authentication.',
    category: 'Share Auth',
    severity: 'INFO',
  },
  PASSWORD_RATE_LIMIT_HIT: {
    label: 'Share Password Auth Rate Limited',
    description: 'Too many failed share password attempts - temporarily blocked.',
    category: 'Share Auth',
    severity: 'WARNING',
  },
  FAILED_PASSWORD_ATTEMPT: {
    label: 'Share Password Auth Login Failed',
    description: 'Incorrect password entered for share page access.',
    category: 'Share Auth',
    severity: 'WARNING',
  },
  PASSWORD_LOCKOUT: {
    label: 'Share Password Auth Lockout',
    description: 'Share page password authentication locked due to excessive failed attempts.',
    category: 'Share Auth',
    severity: 'CRITICAL',
  },

  // Share Page OTP Events
  OTP_RATE_LIMIT_HIT: {
    label: 'Share OTP Auth Rate Limited',
    description: 'Too many failed OTP verification attempts for share page - temporarily blocked.',
    category: 'Share Auth',
    severity: 'WARNING',
  },
  OTP_SENT: {
    label: 'Share OTP Auth Code Sent',
    description: 'One-time password code sent to recipient email for share page authentication.',
    category: 'Share Auth',
    severity: 'INFO',
  },
  OTP_VERIFICATION_FAILED: {
    label: 'Share OTP Auth Failed',
    description: 'Incorrect or expired OTP code entered during share page authentication.',
    category: 'Share Auth',
    severity: 'WARNING',
  },
  OTP_VERIFICATION_SUCCESS: {
    label: 'Share OTP Auth Success',
    description: 'Share page access granted after valid OTP verification.',
    category: 'Share Auth',
    severity: 'INFO',
  },
  UNAUTHORIZED_OTP_REQUEST: {
    label: 'Unauthorized Share OTP Request',
    description: 'OTP code requested for email not authorized as project recipient.',
    category: 'Share Auth',
    severity: 'WARNING',
  },
  GUEST_ACCESS: {
    label: 'Share Guest Access Granted',
    description: 'Guest session created for share page with limited access.',
    category: 'Share Auth',
    severity: 'INFO',
  },

  // Video Access Events
  HOTLINK_DETECTED: {
    label: 'Hotlink Detected',
    description: 'Video accessed from external website - possible unauthorized embedding or sharing.',
    category: 'Video Access',
    severity: 'WARNING',
  },
  HOTLINK_BLOCKED: {
    label: 'Hotlink Blocked',
    description: 'Video access blocked due to strict hotlink protection - request came from unauthorized external domain.',
    category: 'Video Access',
    severity: 'CRITICAL',
  },
  TOKEN_SESSION_MISMATCH: {
    label: 'Token Session Mismatch',
    description: 'Video access token used from different session - security violation detected.',
    category: 'Video Access',
    severity: 'WARNING',
  },
  SUSPICIOUS_ACTIVITY: {
    label: 'Suspicious Activity',
    description: 'Unusually high request rate detected - possible automated scraping or abuse.',
    category: 'Video Access',
    severity: 'WARNING',
  },
  BLOCKED_IP_ATTEMPT: {
    label: 'Blocked IP Access Attempt',
    description: 'Access attempt from IP address on security blocklist.',
    category: 'Security',
    severity: 'CRITICAL',
  },
  RATE_LIMIT_HIT: {
    label: 'Rate Limit Exceeded',
    description: 'Request rate limit exceeded - too many requests in a short time period.',
    category: 'Security',
    severity: 'WARNING',
  },
}

/**
 * Format security event type for display
 */
export function formatSecurityEventType(type: string): string {
  const metadata = SECURITY_EVENT_METADATA[type as SecurityEventType]
  return metadata?.label || type.split('_').map(word =>
    word.charAt(0) + word.slice(1).toLowerCase()
  ).join(' ')
}

/**
 * Get security event description
 */
export function getSecurityEventDescription(type: string): string {
  const metadata = SECURITY_EVENT_METADATA[type as SecurityEventType]
  return metadata?.description || 'No description available.'
}

/**
 * Get security event category
 */
export function getSecurityEventCategory(type: string): string {
  const metadata = SECURITY_EVENT_METADATA[type as SecurityEventType]
  return metadata?.category || 'Unknown'
}

/**
 * Format IP address for display (mask last octet for privacy)
 */
export function formatIpAddress(ip: string | undefined, maskForPrivacy = false): string {
  if (!ip) return 'Unknown'

  if (!maskForPrivacy) return ip

  // Mask last octet for privacy: 192.168.1.100 -> 192.168.1.xxx
  const parts = ip.split('.')
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`
  }

  // IPv6 - mask last segment
  if (ip.includes(':')) {
    const parts = ip.split(':')
    parts[parts.length - 1] = 'xxxx'
    return parts.join(':')
  }

  return ip
}

/**
 * Format session ID for display (truncate)
 */
export function formatSessionId(sessionId: string | undefined): string {
  if (!sessionId) return 'None'
  return sessionId.length > 16 ? `${sessionId.substring(0, 16)}...` : sessionId
}

/**
 * Get all event types by category
 */
export function getEventTypesByCategory(): Record<string, SecurityEventType[]> {
  const categories: Record<string, SecurityEventType[]> = {}

  Object.entries(SECURITY_EVENT_METADATA).forEach(([type, metadata]) => {
    if (!categories[metadata.category]) {
      categories[metadata.category] = []
    }
    categories[metadata.category].push(type as SecurityEventType)
  })

  return categories
}
