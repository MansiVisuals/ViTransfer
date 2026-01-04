'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { PasswordInput } from '@/components/ui/password-input'
import { ChevronDown, ChevronUp, Plus, Send, Trash2, Save } from 'lucide-react'
import { apiDelete, apiFetch, apiPatch, apiPost } from '@/lib/api-client'
import { NOTIFICATION_EVENT_TYPES, type NotificationEventType } from '@/lib/external-notifications/constants'

type Provider = 'GOTIFY' | 'NTFY' | 'PUSHOVER' | 'TELEGRAM'

interface DestinationRow {
  id: string
  name: string
  enabled: boolean
  provider: Provider
  config: any
  hasSecrets: boolean
  subscriptions: Record<string, boolean>
  createdAt: string
  updatedAt: string
}

interface ExternalNotificationsSectionProps {
  show: boolean
  setShow: (value: boolean) => void
}

const EVENT_LABELS: Record<NotificationEventType, string> = {
  FAILED_LOGIN: 'Failed Admin Login Attempts',
  UNAUTHORIZED_OTP: 'Unauthorized OTP Requests',
  SHARE_ACCESS: 'Successful Share Page Access',
  CLIENT_COMMENT: 'Client Comments',
  VIDEO_APPROVAL: 'Video Approvals',
}

function createDefaultSubscriptions(): Record<NotificationEventType, boolean> {
  return NOTIFICATION_EVENT_TYPES.reduce((acc, eventType) => {
    acc[eventType] = true
    return acc
  }, {} as Record<NotificationEventType, boolean>)
}

export function ExternalNotificationsContent({ active, showIntro = true }: { active: boolean; showIntro?: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [destinations, setDestinations] = useState<DestinationRow[]>([])
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})

  const [newProvider, setNewProvider] = useState<Provider>('GOTIFY')
  const [newName, setNewName] = useState('')

  const [newGotifyBaseUrl, setNewGotifyBaseUrl] = useState('')
  const [newGotifyAppToken, setNewGotifyAppToken] = useState('')

  const [newNtfyServerUrl, setNewNtfyServerUrl] = useState('')
  const [newNtfyTopic, setNewNtfyTopic] = useState('')
  const [newNtfyAccessToken, setNewNtfyAccessToken] = useState('')

  const [newPushoverUserKey, setNewPushoverUserKey] = useState('')
  const [newPushoverApiToken, setNewPushoverApiToken] = useState('')

  const [newTelegramChatId, setNewTelegramChatId] = useState('')
  const [newTelegramBotToken, setNewTelegramBotToken] = useState('')

  const [newSubscriptions, setNewSubscriptions] = useState<Record<NotificationEventType, boolean>>(
    createDefaultSubscriptions()
  )

  const loadDestinations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetch('/api/settings/notifications')
      if (!response.ok) {
        throw new Error('Failed to load push notification destinations')
      }
      const data = await response.json()
      setDestinations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load destinations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (active) {
      void loadDestinations()
    }
  }, [active, loadDestinations])

  const providerHelp = useMemo(() => {
    switch (newProvider) {
      case 'GOTIFY':
        return 'Send notifications to a self-hosted Gotify server.'
      case 'NTFY':
        return 'Send notifications to an ntfy topic (self-hosted or ntfy.sh).'
      case 'PUSHOVER':
        return 'Send notifications using Pushover (mobile push).'
      case 'TELEGRAM':
        return 'Send notifications using a Telegram bot.'
      default:
        return ''
    }
  }, [newProvider])

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const resetNewForm = () => {
    setNewProvider('GOTIFY')
    setNewName('')
    setNewGotifyBaseUrl('')
    setNewGotifyAppToken('')
    setNewNtfyServerUrl('')
    setNewNtfyTopic('')
    setNewNtfyAccessToken('')
    setNewPushoverUserKey('')
    setNewPushoverApiToken('')
    setNewTelegramChatId('')
    setNewTelegramBotToken('')
    setNewSubscriptions(createDefaultSubscriptions())
  }

  const handleCreate = async () => {
    setError(null)

    const base: any = {
      provider: newProvider,
      name: newName,
      subscriptions: newSubscriptions,
    }

    if (newProvider === 'GOTIFY') {
      base.config = { baseUrl: newGotifyBaseUrl }
      base.secrets = { appToken: newGotifyAppToken }
    } else if (newProvider === 'NTFY') {
      base.config = { serverUrl: newNtfyServerUrl, topic: newNtfyTopic }
      base.secrets = { accessToken: newNtfyAccessToken || undefined }
    } else if (newProvider === 'PUSHOVER') {
      base.config = {}
      base.secrets = { userKey: newPushoverUserKey, apiToken: newPushoverApiToken }
    } else if (newProvider === 'TELEGRAM') {
      base.config = { chatId: newTelegramChatId }
      base.secrets = { botToken: newTelegramBotToken }
    }

    try {
      await apiPost('/api/settings/notifications', base)
      resetNewForm()
      await loadDestinations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create destination')
    }
  }

  const handleUpdate = async (row: DestinationRow, updates: Partial<DestinationRow> & { secrets?: any }) => {
    setError(null)

    const payload: any = {
      provider: row.provider,
      name: updates.name ?? row.name,
      config: updates.config ?? row.config,
      subscriptions: updates.subscriptions ?? row.subscriptions,
    }

    if (updates.secrets) {
      payload.secrets = updates.secrets
    }

    try {
      await apiPatch(`/api/settings/notifications/${row.id}`, payload)
      await loadDestinations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update destination')
    }
  }

  const handleDelete = async (id: string) => {
    setError(null)
    try {
      await apiDelete(`/api/settings/notifications/${id}`)
      setExpandedIds((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      await loadDestinations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete destination')
    }
  }

  const handleTest = async (id: string) => {
    setError(null)
    try {
      await apiPost(`/api/settings/notifications/${id}/test`, {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue test notification')
    }
  }

  const renderNewProviderFields = () => {
    if (newProvider === 'GOTIFY') {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="newGotifyBaseUrl">Gotify Base URL</Label>
            <Input
              id="newGotifyBaseUrl"
              type="url"
              value={newGotifyBaseUrl}
              onChange={(e) => setNewGotifyBaseUrl(e.target.value)}
              placeholder="https://gotify.example.com"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newGotifyToken">App Token</Label>
            <PasswordInput
              id="newGotifyToken"
              value={newGotifyAppToken}
              onChange={(e) => setNewGotifyAppToken(e.target.value)}
              placeholder="Gotify app token"
              className="font-mono text-sm"
            />
          </div>
        </div>
      )
    }

    if (newProvider === 'NTFY') {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="newNtfyServerUrl">Server URL (Optional)</Label>
            <Input
              id="newNtfyServerUrl"
              type="url"
              value={newNtfyServerUrl}
              onChange={(e) => setNewNtfyServerUrl(e.target.value)}
              placeholder="https://ntfy.sh (leave empty for default)"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newNtfyTopic">Topic</Label>
            <Input
              id="newNtfyTopic"
              type="text"
              value={newNtfyTopic}
              onChange={(e) => setNewNtfyTopic(e.target.value)}
              placeholder="your-topic"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newNtfyToken">Access Token (Optional)</Label>
            <PasswordInput
              id="newNtfyToken"
              value={newNtfyAccessToken}
              onChange={(e) => setNewNtfyAccessToken(e.target.value)}
              placeholder="Bearer token (optional)"
              className="font-mono text-sm"
            />
          </div>
        </div>
      )
    }

    if (newProvider === 'PUSHOVER') {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="newPushoverUserKey">User Key</Label>
            <PasswordInput
              id="newPushoverUserKey"
              value={newPushoverUserKey}
              onChange={(e) => setNewPushoverUserKey(e.target.value)}
              placeholder="Pushover user key"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPushoverApiToken">API Token</Label>
            <PasswordInput
              id="newPushoverApiToken"
              value={newPushoverApiToken}
              onChange={(e) => setNewPushoverApiToken(e.target.value)}
              placeholder="Pushover application token"
              className="font-mono text-sm"
            />
          </div>
        </div>
      )
    }

    if (newProvider === 'TELEGRAM') {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="newTelegramChatId">Chat ID</Label>
            <Input
              id="newTelegramChatId"
              type="text"
              value={newTelegramChatId}
              onChange={(e) => setNewTelegramChatId(e.target.value)}
              placeholder="123456789"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newTelegramBotToken">Bot Token</Label>
            <PasswordInput
              id="newTelegramBotToken"
              value={newTelegramBotToken}
              onChange={(e) => setNewTelegramBotToken(e.target.value)}
              placeholder="Telegram bot token"
              className="font-mono text-sm"
            />
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg text-xs sm:text-sm font-medium bg-destructive-visible text-destructive border-2 border-destructive-visible">
          {error}
        </div>
      )}

      {showIntro && (
        <div className="text-sm text-muted-foreground">
          Configure one or more destinations below.
        </div>
      )}

      <div className="space-y-4 border p-4 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-base">Add Destination</Label>
                <p className="text-xs text-muted-foreground mt-1">{providerHelp}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="newName">Name</Label>
                <Input id="newName" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Admin Phone" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newProvider">Provider</Label>
                <select
                  id="newProvider"
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value as Provider)}
                  className="w-full px-3 py-2 bg-card border border-border rounded-md"
                >
                  <option value="GOTIFY">Gotify</option>
                  <option value="NTFY">ntfy</option>
                  <option value="PUSHOVER">Pushover</option>
                  <option value="TELEGRAM">Telegram</option>
                </select>
              </div>
            </div>

            {renderNewProviderFields()}

            <div className="space-y-3 border-2 border-border p-4 rounded-lg bg-accent/5">
              <h4 className="font-semibold text-sm">Send Notifications For:</h4>
              <div className="space-y-3">
                {NOTIFICATION_EVENT_TYPES.map((eventType) => (
                  <div key={eventType} className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-normal">{EVENT_LABELS[eventType]}</Label>
                    </div>
                    <Switch
                      checked={!!newSubscriptions[eventType]}
                      onCheckedChange={(checked) =>
                        setNewSubscriptions((prev) => ({ ...prev, [eventType]: checked }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                onClick={() => void handleCreate()}
                disabled={loading || !newName.trim()}
                className="w-full sm:w-auto"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Destination
              </Button>
              <Button type="button" variant="outline" onClick={resetNewForm} className="w-full sm:w-auto">
                Reset
              </Button>
            </div>
          </div>

      <div className="space-y-3">
        <Label className="text-base">Destinations</Label>

        {destinations.length === 0 && (
          <div className="text-sm text-muted-foreground border p-4 rounded-lg bg-muted/30">
            No push notification destinations configured yet.
          </div>
        )}

        {destinations.map((dest) => (
          <div key={dest.id} className="border rounded-lg bg-card">
            <button
              type="button"
              className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors"
              onClick={() => toggleExpanded(dest.id)}
            >
              <div className="space-y-0.5">
                <div className="font-medium text-sm">
                  {dest.name}{' '}
                  <span className="text-xs text-muted-foreground">({dest.provider})</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {dest.hasSecrets ? 'Configured' : 'Secrets not configured'} • Updated{' '}
                  {new Date(dest.updatedAt).toLocaleString()}
                </div>
              </div>
              {expandedIds[dest.id] ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>

            {expandedIds[dest.id] && (
              <DestinationEditor dest={dest} onSave={handleUpdate} onDelete={handleDelete} onTest={handleTest} />
            )}
          </div>
        ))}
      </div>

    </div>
  )
}

export function ExternalNotificationsSection({ show, setShow }: ExternalNotificationsSectionProps) {
  return (
    <Card className="border-border">
      <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setShow(!show)}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Push Notifications</CardTitle>
            <CardDescription>Configure push notifications to Gotify, ntfy, Pushover, and more</CardDescription>
          </div>
          {show ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      </CardHeader>

      {show && (
        <CardContent className="space-y-6 border-t pt-4">
          <ExternalNotificationsContent active={show} />
        </CardContent>
      )}
    </Card>
  )
}

function DestinationEditor({
  dest,
  onSave,
  onDelete,
  onTest,
}: {
  dest: DestinationRow
  onSave: (row: DestinationRow, updates: Partial<DestinationRow> & { secrets?: any }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onTest: (id: string) => Promise<void>
}) {
  const [name, setName] = useState(dest.name)
  const [subscriptions, setSubscriptions] = useState<Record<string, boolean>>(dest.subscriptions || {})

  const [gotifyBaseUrl, setGotifyBaseUrl] = useState(dest.provider === 'GOTIFY' ? dest.config?.baseUrl || '' : '')
  const [gotifyAppToken, setGotifyAppToken] = useState('')

  const [ntfyServerUrl, setNtfyServerUrl] = useState(dest.provider === 'NTFY' ? dest.config?.serverUrl || '' : '')
  const [ntfyTopic, setNtfyTopic] = useState(dest.provider === 'NTFY' ? dest.config?.topic || '' : '')
  const [ntfyAccessToken, setNtfyAccessToken] = useState('')

  const [pushoverUserKey, setPushoverUserKey] = useState('')
  const [pushoverApiToken, setPushoverApiToken] = useState('')

  const [telegramChatId, setTelegramChatId] = useState(dest.provider === 'TELEGRAM' ? dest.config?.chatId || '' : '')
  const [telegramBotToken, setTelegramBotToken] = useState('')

  const canSave = !!name.trim()

  const buildUpdates = () => {
    const updates: Partial<DestinationRow> & { secrets?: any } = {
      name,
      subscriptions,
    }

    if (dest.provider === 'GOTIFY') {
      updates.config = { baseUrl: gotifyBaseUrl }
      if (gotifyAppToken.trim()) {
        updates.secrets = { appToken: gotifyAppToken.trim() }
      }
    } else if (dest.provider === 'NTFY') {
      updates.config = { serverUrl: ntfyServerUrl, topic: ntfyTopic }
      if (ntfyAccessToken.trim()) {
        updates.secrets = { accessToken: ntfyAccessToken.trim() }
      }
    } else if (dest.provider === 'PUSHOVER') {
      updates.config = {}
      if (pushoverUserKey.trim() || pushoverApiToken.trim()) {
        updates.secrets = {
          userKey: pushoverUserKey.trim() || undefined,
          apiToken: pushoverApiToken.trim() || undefined,
        }
      }
    } else if (dest.provider === 'TELEGRAM') {
      updates.config = { chatId: telegramChatId }
      if (telegramBotToken.trim()) {
        updates.secrets = { botToken: telegramBotToken.trim() }
      }
    }

    return updates
  }

  const renderProviderFields = () => {
    if (dest.provider === 'GOTIFY') {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Gotify Base URL</Label>
            <Input value={gotifyBaseUrl} onChange={(e) => setGotifyBaseUrl(e.target.value)} className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label>App Token {dest.hasSecrets ? '(leave empty to keep current)' : ''}</Label>
            <PasswordInput
              value={gotifyAppToken}
              onChange={(e) => setGotifyAppToken(e.target.value)}
              placeholder={dest.hasSecrets ? '••••••••' : 'Gotify app token'}
              className="font-mono text-sm"
            />
          </div>
        </div>
      )
    }

    if (dest.provider === 'NTFY') {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Server URL (Optional)</Label>
            <Input value={ntfyServerUrl} onChange={(e) => setNtfyServerUrl(e.target.value)} className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label>Topic</Label>
            <Input value={ntfyTopic} onChange={(e) => setNtfyTopic(e.target.value)} className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label>Access Token (Optional)</Label>
            <PasswordInput
              value={ntfyAccessToken}
              onChange={(e) => setNtfyAccessToken(e.target.value)}
              placeholder={dest.hasSecrets ? '••••••••' : 'Bearer token (optional)'}
              className="font-mono text-sm"
            />
          </div>
        </div>
      )
    }

    if (dest.provider === 'PUSHOVER') {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>User Key {dest.hasSecrets ? '(leave empty to keep current)' : ''}</Label>
            <PasswordInput
              value={pushoverUserKey}
              onChange={(e) => setPushoverUserKey(e.target.value)}
              placeholder={dest.hasSecrets ? '••••••••' : 'Pushover user key'}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>API Token {dest.hasSecrets ? '(leave empty to keep current)' : ''}</Label>
            <PasswordInput
              value={pushoverApiToken}
              onChange={(e) => setPushoverApiToken(e.target.value)}
              placeholder={dest.hasSecrets ? '••••••••' : 'Pushover application token'}
              className="font-mono text-sm"
            />
          </div>
        </div>
      )
    }

    if (dest.provider === 'TELEGRAM') {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Chat ID</Label>
            <Input value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} className="font-mono text-sm" />
          </div>
          <div className="space-y-2">
            <Label>Bot Token {dest.hasSecrets ? '(leave empty to keep current)' : ''}</Label>
            <PasswordInput
              value={telegramBotToken}
              onChange={(e) => setTelegramBotToken(e.target.value)}
              placeholder={dest.hasSecrets ? '••••••••' : 'Telegram bot token'}
              className="font-mono text-sm"
            />
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div className="px-4 pb-4 space-y-4">
      <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3 border p-4 rounded-lg bg-muted/30">
        <Label className="text-base">Provider Configuration</Label>
        {renderProviderFields()}
      </div>

      <div className="space-y-3 border-2 border-border p-4 rounded-lg bg-accent/5">
        <h4 className="font-semibold text-sm">Send Notifications For:</h4>
        <div className="space-y-3">
          {NOTIFICATION_EVENT_TYPES.map((eventType) => (
            <div key={eventType} className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-normal">{EVENT_LABELS[eventType]}</Label>
              </div>
              <Switch
                checked={!!subscriptions[eventType]}
                onCheckedChange={(checked) => setSubscriptions((prev) => ({ ...prev, [eventType]: checked }))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button type="button" onClick={() => void onSave(dest, buildUpdates())} disabled={!canSave} className="w-full sm:w-auto">
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>
        <Button type="button" variant="outline" onClick={() => void onTest(dest.id)} className="w-full sm:w-auto">
          <Send className="w-4 h-4 mr-2" />
          Send Test
        </Button>
        <Button type="button" variant="destructive" onClick={() => void onDelete(dest.id)} className="w-full sm:w-auto">
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </Button>
      </div>
    </div>
  )
}
