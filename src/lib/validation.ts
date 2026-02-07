import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'
import { isValidTimecode } from '@/lib/timecode'

/**
 * Input Validation Schemas
 * Comprehensive validation for all user inputs
 */

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

// Email validation with strict RFC compliance
export const emailSchema = z
  .string()
  .min(5, 'Email must be at least 5 characters')
  .max(255, 'Email must not exceed 255 characters')
  .email('Invalid email format')
  .regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid email format')
  .transform(email => email.toLowerCase().trim())

// Password validation (12+ chars, uppercase, lowercase, number, special)
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')

// Username validation
export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(50, 'Username must not exceed 50 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores')
  .transform(username => username.trim())

// Safe string (prevents XSS)
export const safeStringSchema = (minLength = 1, maxLength = 255) =>
  z
    .string()
    .min(minLength)
    .max(maxLength)
    .trim()
    .refine(val => !/<script|javascript:|on\w+=/i.test(val), {
      message: 'Invalid characters detected'
    })

// Content field (allows more characters, sanitized)
export const contentSchema = z
  .string()
  .min(1, 'Content cannot be empty')
  .max(10000, 'Content must not exceed 10,000 characters')
  .trim()
  .transform(content => {
    // Sanitize HTML to prevent XSS attacks
    // Allow only safe formatting tags
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href', 'target'],
      ALLOW_DATA_ATTR: false,
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
    })
  })

// CUID validation
export const cuidSchema = z
  .string()
  .regex(/^c[a-z0-9]{24}$/, 'Invalid ID format')

// URL validation
export const urlSchema = z
  .string()
  .url('Invalid URL format')
  .max(2048, 'URL too long')

// ============================================================================
// NOTIFICATION SCHEMAS (External providers via worker)
// ============================================================================

export const notificationProviderSchema = z.enum(['GOTIFY', 'NTFY', 'PUSHOVER', 'TELEGRAM'])

export const notificationEventTypeSchema = z.enum([
  'SHARE_ACCESS',
  'ADMIN_ACCESS',
  'CLIENT_COMMENT',
  'VIDEO_APPROVAL',
  'SECURITY_ALERT',
  'TEST',
])

const notificationSecretSchema = z.string().min(1).max(512).trim()

const gotifyDestinationSchema = z.object({
  provider: z.literal('GOTIFY'),
  name: safeStringSchema(1, 100),
  enabled: z.boolean().optional(),
  config: z.object({
    baseUrl: urlSchema,
  }),
  secrets: z.object({
    appToken: notificationSecretSchema,
  }),
  subscriptions: z.record(notificationEventTypeSchema, z.boolean()).optional(),
})

const ntfyDestinationSchema = z.object({
  provider: z.literal('NTFY'),
  name: safeStringSchema(1, 100),
  enabled: z.boolean().optional(),
  config: z.object({
    serverUrl: urlSchema.optional().or(z.literal('')),
    topic: z.string().min(1).max(128).trim(),
  }),
  secrets: z.object({
    accessToken: notificationSecretSchema.optional(),
  }),
  subscriptions: z.record(notificationEventTypeSchema, z.boolean()).optional(),
})

const pushoverDestinationSchema = z.object({
  provider: z.literal('PUSHOVER'),
  name: safeStringSchema(1, 100),
  enabled: z.boolean().optional(),
  config: z.object({}),
  secrets: z.object({
    userKey: notificationSecretSchema,
    apiToken: notificationSecretSchema,
  }),
  subscriptions: z.record(notificationEventTypeSchema, z.boolean()).optional(),
})

const telegramDestinationSchema = z.object({
  provider: z.literal('TELEGRAM'),
  name: safeStringSchema(1, 100),
  enabled: z.boolean().optional(),
  config: z.object({
    chatId: z.string().min(1).max(128).trim(),
  }),
  secrets: z.object({
    botToken: notificationSecretSchema,
  }),
  subscriptions: z.record(notificationEventTypeSchema, z.boolean()).optional(),
})

export const createNotificationDestinationSchema = z.discriminatedUnion('provider', [
  gotifyDestinationSchema,
  ntfyDestinationSchema,
  pushoverDestinationSchema,
  telegramDestinationSchema,
])

export const updateNotificationDestinationSchema = z.discriminatedUnion('provider', [
  gotifyDestinationSchema.extend({
    enabled: z.boolean().optional(),
    secrets: z.object({ appToken: notificationSecretSchema.optional() }).optional(),
  }),
  ntfyDestinationSchema.extend({
    enabled: z.boolean().optional(),
    secrets: z.object({ accessToken: notificationSecretSchema.optional() }).optional(),
  }),
  pushoverDestinationSchema.extend({
    enabled: z.boolean().optional(),
    secrets: z
      .object({ userKey: notificationSecretSchema.optional(), apiToken: notificationSecretSchema.optional() })
      .optional(),
  }),
  telegramDestinationSchema.extend({
    enabled: z.boolean().optional(),
    secrets: z.object({ botToken: notificationSecretSchema.optional() }).optional(),
  }),
])

// ============================================================================
// USER SCHEMAS
// ============================================================================

export const createUserSchema = z.object({
  email: emailSchema,
  username: usernameSchema.optional(),
  password: passwordSchema,
  name: safeStringSchema(1, 255).optional(),
  role: z.enum(['ADMIN']).optional()
})

export const updateUserSchema = z.object({
  email: emailSchema.optional(),
  username: usernameSchema.optional(),
  password: passwordSchema.optional(),
  name: safeStringSchema(1, 255).optional()
})

export const loginSchema = z.object({
  email: z.string().min(1, 'Email/username is required').max(255),
  password: z.string().min(1, 'Password is required').max(128)
})

// ============================================================================
// PROJECT SCHEMAS
// ============================================================================

export const createProjectSchema = z.object({
  title: safeStringSchema(1, 255),
  description: safeStringSchema(0, 5000).optional().nullable(),
  companyName: safeStringSchema(0, 100)
    .refine(val => !val || !/[\r\n]/.test(val), {
      message: 'Company name cannot contain line breaks'
    })
    .optional()
    .nullable(),
  clientCompanyId: z.string().cuid().optional().nullable(), // Optional link to client directory
  recipientEmail: emailSchema.optional().nullable().or(z.literal('')), // Optional recipient email (will create ProjectRecipient if provided)
  recipientName: safeStringSchema(0, 255).optional().nullable(), // Optional recipient name
  sharePassword: z.union([
    z.literal(''), // Allow empty string for non-password auth modes
    z.null(), // Allow null
    z.string()
      .min(8, 'Share password must be at least 8 characters')
      .max(255, 'Share password must not exceed 255 characters')
      .regex(/[A-Za-z]/, 'Share password must contain at least one letter')
      .regex(/[0-9]/, 'Share password must contain at least one number')
  ]).optional(),
  authMode: z.enum(['PASSWORD', 'OTP', 'BOTH', 'NONE']).optional(),
  enableRevisions: z.boolean().optional(),
  maxRevisions: z.number().int().min(1).max(10).optional(),
  restrictCommentsToLatestVersion: z.boolean().optional(),
  isShareOnly: z.boolean().optional(),
  previewResolution: z.enum(['720p', '1080p']).optional(),
  watermarkText: safeStringSchema(0, 100).optional()
})

export const updateProjectSchema = z.object({
  // Basic project info
  title: safeStringSchema(1, 200).optional(),
  slug: safeStringSchema(1, 200)
    .refine(val => !val || /^[a-z0-9-]+$/.test(val), {
      message: 'Slug can only contain lowercase letters, numbers, and hyphens'
    })
    .optional(),
  description: safeStringSchema(0, 2000).nullable().optional(),
  companyName: safeStringSchema(0, 200)
    .refine(val => !val || !/[\r\n]/.test(val), {
      message: 'Company name cannot contain line breaks'
    })
    .nullable()
    .optional(),
  clientCompanyId: z.string().cuid().optional().nullable(), // Optional link to client directory
  status: z.enum(['IN_REVIEW', 'APPROVED', 'SHARE_ONLY', 'ARCHIVED']).optional(),

  // Revision settings
  enableRevisions: z.boolean().optional(),
  maxRevisions: z.number().int().min(0).max(50).optional(),
  restrictCommentsToLatestVersion: z.boolean().optional(),

  // Display settings
  hideFeedback: z.boolean().optional(),
  timestampDisplay: z.enum(['AUTO', 'TIMECODE']).optional(),
  previewResolution: z.enum(['720p', '1080p']).optional(),

  // Watermark settings
  watermarkEnabled: z.boolean().optional(),
  watermarkText: safeStringSchema(0, 100).nullable().optional(),

  // Download settings
  allowAssetDownload: z.boolean().optional(),

  // Approval settings
  clientCanApprove: z.boolean().optional(),

  // Approved playback settings
  usePreviewForApprovedPlayback: z.boolean().optional(),

  // Authentication settings
  sharePassword: z.string()
    .min(8, 'Share password must be at least 8 characters')
    .max(200, 'Share password must not exceed 200 characters')
    .regex(/[A-Za-z]/, 'Share password must contain at least one letter')
    .regex(/[0-9]/, 'Share password must contain at least one number')
    .nullable()
    .optional()
    .or(z.literal('')),
  authMode: z.enum(['PASSWORD', 'OTP', 'BOTH', 'NONE']).optional(),

  // Guest mode settings
  guestMode: z.boolean().optional(),
  guestLatestOnly: z.boolean().optional(),

  // Client notification settings
  clientNotificationSchedule: z.enum(['IMMEDIATE', 'HOURLY', 'DAILY', 'WEEKLY']).optional(),
  clientNotificationTime: z.string()
    .regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format. Expected HH:MM')
    .nullable()
    .optional(),
  clientNotificationDay: z.number().int().min(0).max(6).nullable().optional()
})

// ============================================================================
// VIDEO SCHEMAS
// ============================================================================

export const createVideoSchema = z.object({
  projectId: cuidSchema,
  versionLabel: safeStringSchema(1, 50).optional(),
  originalFileName: safeStringSchema(1, 255),
  originalFileSize: z.number().int().positive().max(10 * 1024 * 1024 * 1024) // Max 10GB
})

// ============================================================================
// COMMENT SCHEMAS
// ============================================================================

export const createCommentSchema = z.object({
  projectId: cuidSchema,
  videoId: cuidSchema, // Required - all comments must be video-specific
  videoVersion: z.number().int().positive().optional(),
  timecode: z.string().refine(isValidTimecode, {
    message: 'Invalid timecode format. Expected HH:MM:SS:FF'
  }),
  content: contentSchema,
  authorName: safeStringSchema(1, 255).optional().nullable(),
  authorEmail: emailSchema.optional().nullable(),
  recipientId: cuidSchema.optional().nullable(),
  parentId: cuidSchema.optional(),
  isInternal: z.boolean().optional()
})

export const updateCommentSchema = z.object({
  content: contentSchema.optional(),
  authorName: safeStringSchema(1, 255).optional()
})

// ============================================================================
// SETTINGS SCHEMAS
// ============================================================================

export const updateSettingsSchema = z.object({
  companyName: safeStringSchema(0, 100)
    .refine(val => !val || !/[\r\n]/.test(val), {
      message: 'Company name cannot contain line breaks'
    })
    .optional(),
  smtpServer: z.string().max(255).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUsername: z.string().max(255).optional(),
  smtpPassword: z.string().max(255).optional(),
  smtpFromAddress: emailSchema.optional(),
  smtpSecure: z.enum(['STARTTLS', 'TLS', 'NONE']).optional(),
  appDomain: urlSchema.optional(),
  defaultPreviewResolution: z.enum(['720p', '1080p']).optional(),
  defaultWatermarkText: safeStringSchema(0, 100).optional(),
  maxUploadSizeGB: z.number().int().min(1).max(100).optional() // 1GB to 100GB
})

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate request data against a schema
 * Returns validated data or throws error with details
 */
export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string; details: string[] } {
  try {
    const validated = schema.parse(data)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.issues.map(e => {
        const path = e.path.join('.')
        return path ? `${path}: ${e.message}` : e.message
      })
      return {
        success: false,
        error: 'Validation failed',
        details
      }
    }
    return {
      success: false,
      error: 'Validation failed',
      details: ['Unknown validation error']
    }
  }
}
