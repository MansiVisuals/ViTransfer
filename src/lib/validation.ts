import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'

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
  description: safeStringSchema(0, 5000).optional(),
  companyName: safeStringSchema(0, 100)
    .refine(val => !val || !/[\r\n]/.test(val), {
      message: 'Company name cannot contain line breaks'
    })
    .optional(),
  recipientEmail: emailSchema.optional().or(z.literal('')), // Optional recipient email (will create ProjectRecipient if provided)
  recipientName: safeStringSchema(0, 255).optional(), // Optional recipient name
  sharePassword: z.string().min(8).max(255).optional().or(z.literal('')),
  authMode: z.enum(['PASSWORD', 'OTP', 'BOTH', 'NONE']).optional(),
  enableRevisions: z.boolean().optional(),
  maxRevisions: z.number().int().min(1).max(10).optional(),
  restrictCommentsToLatestVersion: z.boolean().optional(),
  isShareOnly: z.boolean().optional(),
  previewResolution: z.enum(['720p', '1080p']).optional(),
  watermarkText: safeStringSchema(0, 100).optional()
})

export const updateProjectSchema = z.object({
  title: safeStringSchema(1, 255).optional(),
  description: safeStringSchema(0, 5000).optional(),
  companyName: safeStringSchema(0, 100)
    .refine(val => !val || !/[\r\n]/.test(val), {
      message: 'Company name cannot contain line breaks'
    })
    .optional(),
  sharePassword: z.string().min(8).max(255).optional().or(z.literal('')),
  authMode: z.enum(['PASSWORD', 'OTP', 'BOTH', 'NONE']).optional(),
  enableRevisions: z.boolean().optional(),
  maxRevisions: z.number().int().min(1).max(10).optional(),
  restrictCommentsToLatestVersion: z.boolean().optional(),
  hideFeedback: z.boolean().optional(),
  status: z.enum(['IN_REVIEW', 'APPROVED', 'SHARE_ONLY']).optional(),
  previewResolution: z.enum(['720p', '1080p']).optional(),
  watermarkText: safeStringSchema(0, 100).optional()
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
  timestamp: z.number().min(0).optional().nullable(),
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
