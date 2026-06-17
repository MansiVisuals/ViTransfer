export const NOTIFICATION_EVENT_TYPES = [
  'SHARE_ACCESS',
  'ADMIN_ACCESS',
  'CLIENT_COMMENT',
  'VIDEO_APPROVAL',
  'CLIENT_UPLOAD',
  'SECURITY_ALERT',
  'DUE_DATE_REMINDER',
] as const

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number]

