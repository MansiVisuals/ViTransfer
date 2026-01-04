export const NOTIFICATION_EVENT_TYPES = [
  'FAILED_LOGIN',
  'UNAUTHORIZED_OTP',
  'SHARE_ACCESS',
  'CLIENT_COMMENT',
  'VIDEO_APPROVAL',
] as const

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number]

export const NOTIFICATION_NOTIFY_TYPES = ['info', 'success', 'warning', 'failure'] as const

export type NotificationNotifyType = (typeof NOTIFICATION_NOTIFY_TYPES)[number]

