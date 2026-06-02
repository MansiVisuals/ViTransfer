import { z } from 'zod'
import DOMPurify from 'isomorphic-dompurify'
import { isValidTimecode } from '@/lib/timecode'
import { NextResponse } from 'next/server'

// COMMON SCHEMAS
// ============================================================================

export const emailSchema = z
  .string()
  .min(5, 'Email must be at least 5 characters')
  .max(255, 'Email must not exceed 255 characters')
  .email('Invalid email format')
  .regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid email format')
  .transform(email => email.toLowerCase().trim())

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')

export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(50, 'Username must not exceed 50 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores')
  .transform(username => username.trim())

export const safeStringSchema = (minLength = 1, maxLength = 255) =>
  z
    .string()
    .min(minLength)
    .max(maxLength)
    .trim()
    .refine(val => !/<script|javascript:|on\w+=/i.test(val), {
      message: 'Invalid characters detected'
    })

export const contentSchema = z
  .string()
  .min(1, 'Content cannot be empty')
  .max(10000, 'Content must not exceed 10,000 characters')
  .trim()
  .transform(content => {
    return DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href', 'target'],
      ALLOW_DATA_ATTR: false,
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
    })
  })

export const cuidSchema = z
  .string()
  .regex(/^c[a-z0-9]{24}$/, 'Invalid ID format')

export const urlSchema = z
  .string()
  .url('Invalid URL format')
  .max(2048, 'URL too long')

// Cloud-metadata / link-local hosts that are NEVER a legitimate notification target.
// Self-hosted private-network destinations (10.x, 192.168.x, etc.) remain allowed by design —
// users routinely run Gotify/NTFY on the same LAN as the app. This list only blocks endpoints
// where the only realistic intent is SSRF against cloud instance-metadata services.
const SSRF_DENY_HOSTS = new Set([
  '169.254.169.254',
  '[fd00:ec2::254]',
  'fd00:ec2::254',
  'metadata.google.internal',
  'metadata.goog',
  'metadata',
])

function isMetadataServiceHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return SSRF_DENY_HOSTS.has(h)
}

// URL schema for outbound notification destinations: format-validated AND blocks
// cloud-metadata hosts that have no legitimate notification use case.
export const notificationUrlSchema = urlSchema
  .refine(
    (val) => {
      try {
        const u = new URL(val)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
        if (isMetadataServiceHost(u.hostname)) return false
        return true
      } catch {
        return false
      }
    },
    { message: 'URL must be http(s) and not point to a cloud metadata service' }
  )

// ============================================================================
// NOTIFICATION SCHEMAS (External providers via worker)
// ============================================================================

const notificationEventTypeSchema = z.enum([
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
    baseUrl: notificationUrlSchema,
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
    serverUrl: notificationUrlSchema.optional().or(z.literal('')),
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
  dueDate: z.string().datetime().nullable().optional(),
  dueReminder: z.enum(['NONE', 'DAY_BEFORE', 'WEEK_BEFORE']).nullable().optional(),
  isShareOnly: z.boolean().optional(),
  previewResolution: z.enum(['720p', '1080p', '2160p']).optional(),
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
  previewResolution: z.enum(['720p', '1080p', '2160p']).optional(),

  // Transcoding settings
  skipTranscoding: z.boolean().optional(),

  // Preview LUT settings
  applyPreviewLut: z.boolean().optional(),

  // Watermark settings
  watermarkEnabled: z.boolean().optional(),
  watermarkText: safeStringSchema(0, 100).nullable().optional(),
  watermarkPositions: z.string().refine(val => {
    const valid = ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right']
    return val.split(',').map(p => p.trim()).every(p => valid.includes(p))
  }, { message: 'Invalid watermark position(s)' }).optional(),
  watermarkOpacity: z.number().int().min(10).max(100).optional(),
  watermarkFontSize: z.enum(['small', 'medium', 'large']).optional(),

  // Download settings
  allowAssetDownload: z.boolean().optional(),

  // Client asset upload
  allowClientAssetUpload: z.boolean().optional(),

  // Reverse share
  allowReverseShare: z.boolean().optional(),

  // Approval settings
  clientCanApprove: z.boolean().optional(),

  // Approved playback settings
  usePreviewForApprovedPlayback: z.boolean().optional(),

  // Client tutorial
  showClientTutorial: z.boolean().optional(),

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

  // Due date
  dueDate: z.string().datetime().nullable().optional(),
  dueReminder: z.enum(['NONE', 'DAY_BEFORE', 'WEEK_BEFORE']).nullable().optional(),

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

// ============================================================================
// COMMENT SCHEMAS
// ============================================================================

// Annotation shape validation schemas
const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
const strokeWidthSchema = z.number().min(0.001).max(0.05)

const freehandShapeSchema = z.object({
  id: z.string().min(1).max(50),
  type: z.literal('freehand'),
  color: hexColorSchema,
  strokeWidth: strokeWidthSchema,
  opacity: z.number().min(0).max(1).optional(),
  points: z.array(pointSchema).min(1).max(5000),
})

const shapeSchema = freehandShapeSchema

const annotationDataSchema = z.object({
  version: z.literal(1),
  shapes: z.array(shapeSchema).min(1).max(200),
})

export const createCommentSchema = z.object({
  projectId: cuidSchema,
  videoId: cuidSchema, // Required - all comments must be video-specific
  videoVersion: z.number().int().positive().optional(),
  timecode: z.string().refine(isValidTimecode, {
    message: 'Invalid timecode format. Expected HH:MM:SS:FF'
  }),
  timecodeEnd: z.string().refine(isValidTimecode, {
    message: 'Invalid end timecode format. Expected HH:MM:SS:FF'
  }).optional().nullable(),
  content: contentSchema,
  authorName: safeStringSchema(1, 255).optional().nullable(),
  authorEmail: emailSchema.optional().nullable(),
  recipientId: cuidSchema.optional().nullable(),
  parentId: cuidSchema.optional(),
  isInternal: z.boolean().optional(),
  assetIds: z.array(z.string()).max(50).optional(),
  annotations: annotationDataSchema.optional().nullable(),
})

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const DEFAULT_MAX_BODY_BYTES = 1_000_000 // 1 MB

type CappedBody =
  | { ok: true; data: any }
  | { ok: false; reason: 'too_large' | 'invalid' }

// Reads the JSON body with a hard byte ceiling, aborting the stream once exceeded so an
// oversized payload is never fully buffered into memory.
async function readJsonCapped(request: Request, maxBytes: number): Promise<CappedBody> {
  const declared = request.headers.get('content-length')
  if (declared && Number(declared) > maxBytes) return { ok: false, reason: 'too_large' }

  if (!request.body) {
    const text = await request.text().catch(() => '')
    if (text.length > maxBytes) return { ok: false, reason: 'too_large' }
    if (!text) return { ok: false, reason: 'invalid' }
    try { return { ok: true, data: JSON.parse(text) } } catch { return { ok: false, reason: 'invalid' } }
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        return { ok: false, reason: 'too_large' }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, reason: 'invalid' }
  }

  if (total === 0) return { ok: false, reason: 'invalid' }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { ok: true, data: JSON.parse(new TextDecoder().decode(merged)) }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}

const bodyTooLargeResponse = () => NextResponse.json({ error: 'Request body too large' }, { status: 413 })

/**
 * Safely parse a JSON body, capped at maxBytes (default 1 MB).
 * Returns 413 if oversized, 400 on invalid/missing JSON.
 */
export async function safeParseBody(
  request: Request,
  options: { maxBytes?: number } = {}
): Promise<{ success: true; data: any } | { success: false; response: NextResponse }> {
  const result = await readJsonCapped(request, options.maxBytes ?? DEFAULT_MAX_BODY_BYTES)
  if (result.ok) return { success: true, data: result.data }
  if (result.reason === 'too_large') return { success: false, response: bodyTooLargeResponse() }
  return { success: false, response: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
}

/**
 * Like safeParseBody but tolerates an empty/invalid body (returns {}) for routes that treat a
 * missing body as "no fields provided". Still rejects oversized payloads with 413.
 */
export async function safeParseBodyTolerant(
  request: Request,
  options: { maxBytes?: number } = {}
): Promise<{ success: true; data: any } | { success: false; response: NextResponse }> {
  const result = await readJsonCapped(request, options.maxBytes ?? DEFAULT_MAX_BODY_BYTES)
  if (!result.ok && result.reason === 'too_large') {
    return { success: false, response: bodyTooLargeResponse() }
  }
  return { success: true, data: result.ok ? result.data : {} }
}

// Saved-view state for the admin Projects Dashboard.
// Mirrors SerializedFilterState from src/lib/projects-filter.ts; kept in lockstep.
const savedViewStateSchema = z.object({
  q: z.string().max(200),
  statuses: z.array(z.enum(['IN_REVIEW', 'APPROVED', 'SHARE_ONLY', 'ARCHIVED'])).max(8),
  clientKeys: z.array(z.string().max(200)).max(500),
  years: z.array(z.string().regex(/^\d{4}$/)).max(50),
  dueBuckets: z.array(z.enum(['overdue', 'thisWeek', 'thisMonth', 'later', 'none'])).max(8),
  sort: z.enum([
    'updatedDesc',
    'createdDesc',
    'createdAsc',
    'dueAsc',
    'titleAsc',
    'titleDesc',
    'statusPriority',
  ]),
})

export const createSavedViewSchema = z.object({
  name: safeStringSchema(1, 100),
  state: savedViewStateSchema,
})

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
