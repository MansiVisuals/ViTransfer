export const NOTIFICATION_EVENT_TYPES = [
  'SHARE_ACCESS',
  'ADMIN_ACCESS',
  'CLIENT_COMMENT',
  'VIDEO_APPROVAL',
  'SECURITY_ALERT',
  'DUE_DATE_REMINDER',
] as const

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number]

export const NOTIFICATION_NOTIFY_TYPES = ['info', 'success', 'warning', 'failure'] as const

export type NotificationNotifyType = (typeof NOTIFICATION_NOTIFY_TYPES)[number]

