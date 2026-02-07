'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { apiFetch, apiPost, apiPatch } from '@/lib/api-client'
import { NOTIFICATION_EVENT_TYPES, type NotificationEventType } from '@/lib/external-notifications/constants'
import { Bell, BellOff, Send, Trash2, Smartphone, Monitor, Pencil, Check, X } from 'lucide-react'

interface PushSubscription {
  id: string
  deviceName: string | null
  userAgent: string | null
  subscribedEvents: string[]
  createdAt: string
  lastUsedAt: string
  endpoint: string
}

const EVENT_LABELS: Record<NotificationEventType, string> = {
  SHARE_ACCESS: 'Share Page Access',
  ADMIN_ACCESS: 'Admin Login',
  CLIENT_COMMENT: 'New Comments',
  VIDEO_APPROVAL: 'Video Approvals',
  SECURITY_ALERT: 'Security Alerts',
}

export function WebPushSection({ active }: { active: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [subscriptions, setSubscriptions] = useState<PushSubscription[]>([])
  const [currentDeviceSubscribed, setCurrentDeviceSubscribed] = useState(false)
  const [currentSubscriptionId, setCurrentSubscriptionId] = useState<string | null>(null)
  const [permissionState, setPermissionState] = useState<NotificationPermission | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // Check browser support
  const isPushSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  // Load subscriptions
  const loadSubscriptions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch('/api/push/subscribe')
      if (!response.ok) {
        throw new Error('Failed to load subscriptions')
      }
      const data = await response.json()
      setSubscriptions(data.subscriptions || [])

      // Check if current device is subscribed
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          const currentEndpoint = new URL(subscription.endpoint).origin
          const found = data.subscriptions?.find(
            (s: PushSubscription) => s.endpoint === currentEndpoint
          )
          setCurrentDeviceSubscribed(!!found)
          setCurrentSubscriptionId(found?.id || null)
        } else {
          setCurrentDeviceSubscribed(false)
          setCurrentSubscriptionId(null)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions')
    } finally {
      setLoading(false)
    }
  }, [])

  // Check notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionState(Notification.permission)
    }
  }, [])

  // Load data when active
  useEffect(() => {
    if (active && isPushSupported) {
      void loadSubscriptions()
    }
  }, [active, isPushSupported, loadSubscriptions])

  // Subscribe current device
  const handleSubscribe = async () => {
    setError(null)
    setSuccess(null)

    try {
      // Request notification permission
      const permission = await Notification.requestPermission()
      setPermissionState(permission)

      if (permission !== 'granted') {
        setError('Notification permission denied. Please enable notifications in your browser settings.')
        return
      }

      // Get VAPID public key
      const vapidResponse = await apiFetch('/api/push/vapid-public-key')
      if (!vapidResponse.ok) {
        throw new Error('Failed to get VAPID key')
      }
      const { publicKey } = await vapidResponse.json()

      // Subscribe to push manager
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })

      // Send subscription to server
      const keys = subscription.toJSON().keys
      // apiPost returns parsed JSON directly, throws on error
      const data = await apiPost('/api/push/subscribe', {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: keys?.p256dh,
          auth: keys?.auth,
        },
      })

      setCurrentDeviceSubscribed(true)
      setCurrentSubscriptionId(data.subscriptionId || null)
      setSuccess('Push notifications enabled for this device')
      await loadSubscriptions()
    } catch (err) {
      console.error('Subscribe error:', err)
      setError(err instanceof Error ? err.message : 'Failed to subscribe')
    }
  }

  // Unsubscribe current device
  const handleUnsubscribe = async () => {
    setError(null)
    setSuccess(null)

    try {
      // Unsubscribe from push manager
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
      }

      // Remove from server
      if (currentSubscriptionId) {
        await apiPost('/api/push/unsubscribe', {
          subscriptionId: currentSubscriptionId,
        })
      }

      setCurrentDeviceSubscribed(false)
      setCurrentSubscriptionId(null)
      setSuccess('Push notifications disabled for this device')
      await loadSubscriptions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe')
    }
  }

  // Remove a subscription
  const handleRemoveSubscription = async (subscriptionId: string) => {
    setError(null)
    try {
      // apiPost returns parsed JSON directly, throws on error
      await apiPost('/api/push/unsubscribe', { subscriptionId })
      if (subscriptionId === currentSubscriptionId) {
        setCurrentDeviceSubscribed(false)
        setCurrentSubscriptionId(null)
      }
      await loadSubscriptions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove subscription')
    }
  }

  // Send test notification
  const handleTestNotification = async (subscriptionId: string) => {
    setError(null)
    setSuccess(null)
    try {
      // apiPost returns parsed JSON directly, throws on error
      await apiPost('/api/push/test', { subscriptionId })
      setSuccess('Test notification sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test')
    }
  }

  // Update subscription events
  const handleToggleEvent = async (subscriptionId: string, eventType: string, enabled: boolean) => {
    const subscription = subscriptions.find((s) => s.id === subscriptionId)
    if (!subscription) return

    const currentEvents = subscription.subscribedEvents
    const newEvents = enabled
      ? [...currentEvents, eventType]
      : currentEvents.filter((e) => e !== eventType)

    try {
      // apiPatch returns parsed JSON directly, throws on error
      await apiPatch('/api/push/subscribe', {
        subscriptionId,
        subscribedEvents: newEvents,
      })
      await loadSubscriptions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    }
  }

  // Update device name
  const handleUpdateName = async (subscriptionId: string) => {
    try {
      // apiPatch returns parsed JSON directly, throws on error
      await apiPatch('/api/push/subscribe', {
        subscriptionId,
        deviceName: editName,
      })
      setEditingId(null)
      await loadSubscriptions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update name')
    }
  }

  // Not supported UI
  if (!isPushSupported) {
    return (
      <div className="text-sm text-muted-foreground">
        <p>Push notifications are not supported in this browser.</p>
        <p className="mt-2">Requirements:</p>
        <ul className="list-disc list-inside mt-1 space-y-1">
          <li>A modern browser (Chrome, Firefox, Edge, Safari 16+)</li>
          <li>HTTPS connection (or localhost)</li>
          <li>Service worker support</li>
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status messages */}
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-md">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 rounded-md">
          {success}
        </div>
      )}

      {/* Current device subscription */}
      <div className="p-4 border rounded-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {currentDeviceSubscribed ? (
              <Bell className="h-5 w-5 text-green-500" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <h4 className="font-medium">This Device</h4>
              <p className="text-sm text-muted-foreground">
                {currentDeviceSubscribed
                  ? 'Push notifications are enabled'
                  : permissionState === 'denied'
                    ? 'Notifications blocked in browser settings'
                    : 'Enable push notifications for this browser'}
              </p>
            </div>
          </div>
          <Button
            onClick={currentDeviceSubscribed ? handleUnsubscribe : handleSubscribe}
            variant={currentDeviceSubscribed ? 'outline' : 'default'}
            disabled={permissionState === 'denied' && !currentDeviceSubscribed}
          >
            {currentDeviceSubscribed ? 'Disable' : 'Enable'}
          </Button>
        </div>

        {permissionState === 'denied' && !currentDeviceSubscribed && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            To enable notifications, click the lock icon in your browser&apos;s address bar and allow notifications.
          </p>
        )}
      </div>

      {/* Subscribed devices */}
      {subscriptions.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Subscribed Devices ({subscriptions.length})</h4>
          <div className="space-y-3">
            {subscriptions.map((sub) => (
              <div key={sub.id} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {sub.userAgent?.includes('Mobile') ? (
                      <Smartphone className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <Monitor className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      {editingId === sub.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-7 w-40"
                            autoFocus
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleUpdateName(sub.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {sub.deviceName || 'Unknown Device'}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingId(sub.id)
                              setEditName(sub.deviceName || '')
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {sub.id === currentSubscriptionId && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                              Current
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground truncate">
                        Last used: {new Date(sub.lastUsedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => handleTestNotification(sub.id)}
                      title="Send test notification"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveSubscription(sub.id)}
                      title="Remove subscription"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Event toggles */}
                <div className="space-y-3 border-2 border-border p-4 rounded-lg bg-accent/5">
                  <h4 className="font-semibold text-sm">Send Notifications For:</h4>
                  <div className="space-y-3">
                    {NOTIFICATION_EVENT_TYPES.map((eventType) => (
                      <div key={eventType} className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-normal">{EVENT_LABELS[eventType]}</Label>
                        </div>
                        <Switch
                          checked={sub.subscribedEvents.includes(eventType)}
                          onCheckedChange={(checked) =>
                            handleToggleEvent(sub.id, eventType, checked)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No subscriptions */}
      {subscriptions.length === 0 && !loading && (
        <div className="text-center text-sm text-muted-foreground py-8">
          <BellOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No devices subscribed to push notifications.</p>
          <p className="mt-1">Enable notifications on this device to get started.</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center text-sm text-muted-foreground py-4">
          Loading...
        </div>
      )}
    </div>
  )
}

// Helper to convert VAPID public key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
