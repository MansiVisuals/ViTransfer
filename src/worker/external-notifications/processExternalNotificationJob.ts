import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import type { ExternalNotificationJob } from '@/lib/queue'
import { sendAppriseNotification } from '@/worker/external-notifications/sendAppriseNotification'

type Provider = 'GOTIFY' | 'NTFY' | 'PUSHOVER' | 'TELEGRAM'

const VERBOSE = process.env.DEBUG_WORKER === 'true' || process.env.DEBUG_EXTERNAL_NOTIFICATIONS === 'true'

function redactUrlSecrets(message: string): string {
  return message.replace(/\b(gotify|gotifys|ntfy|ntfys|tgram|pover):\/\/\S+/g, (_m, scheme) => `${scheme}://<redacted>`)
}

function log(message: string, extra?: Record<string, unknown>) {
  if (extra && VERBOSE) {
    console.log('[EXTERNAL-NOTIFICATIONS]', message, extra)
    return
  }
  console.log('[EXTERNAL-NOTIFICATIONS]', message)
}

function logError(message: string, extra?: Record<string, unknown>) {
  if (extra && VERBOSE) {
    console.error('[EXTERNAL-NOTIFICATIONS]', message, extra)
    return
  }
  const err = typeof extra?.error === 'string' ? redactUrlSecrets(extra.error) : ''
  console.error('[EXTERNAL-NOTIFICATIONS]', err ? `${message}: ${err}` : message)
}

function safeTextPreview(text: string, maxLen: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLen) return normalized
  return `${normalized.slice(0, maxLen)}...`
}

function clampText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  if (maxLen <= 3) return text.slice(0, maxLen)
  return `${text.slice(0, maxLen - 3)}...`
}

function normalizeTelegramText(text: string): string {
  // Telegram providers frequently use HTML/Markdown parse modes; raw `<`/`>` can break sends.
  const normalized = text.replace(/\r\n/g, '\n').replace(/[<>]/g, '')
  return clampText(normalized, 3500)
}

function buildGotifyUrl(baseUrl: string, appToken: string): string {
  const parsed = new URL(baseUrl)
  const schema = parsed.protocol === 'https:' ? 'gotifys' : 'gotify'
  const host = parsed.hostname
  const port = parsed.port ? `:${parsed.port}` : ''
  let path = parsed.pathname || '/'
  if (!path.endsWith('/')) path += '/'
  return `${schema}://${host}${port}${path}${encodeURIComponent(appToken)}`
}

function buildNtfyUrl(serverUrl: string | undefined, topic: string, accessToken?: string): string {
  if (!serverUrl) {
    return `ntfys://${encodeURIComponent(topic)}`
  }

  const parsed = new URL(serverUrl)
  const schema = parsed.protocol === 'https:' ? 'ntfys' : 'ntfy'
  const host = parsed.hostname
  const port = parsed.port ? `:${parsed.port}` : ''
  const auth = accessToken ? `${encodeURIComponent(accessToken)}@` : ''
  return `${schema}://${auth}${host}${port}/${encodeURIComponent(topic)}`
}

function buildPushoverUrl(userKey: string, apiToken: string): string {
  return `pover://${encodeURIComponent(userKey)}@${encodeURIComponent(apiToken)}`
}

function buildTelegramUrl(botToken: string, chatId: string): string {
  return `tgram://${encodeURIComponent(botToken)}/${encodeURIComponent(chatId)}`
}

function parseSecrets(secretsEncrypted: string | null): Record<string, any> | null {
  if (!secretsEncrypted) return null
  try {
    const decrypted = decrypt(secretsEncrypted)
    const parsed = JSON.parse(decrypted)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function buildAppriseUrl(provider: Provider, config: any, secrets: Record<string, any>): string {
  if (provider === 'GOTIFY') {
    return buildGotifyUrl(String(config?.baseUrl || ''), String(secrets.appToken || ''))
  }

  if (provider === 'NTFY') {
    const serverUrl = config?.serverUrl ? String(config.serverUrl) : undefined
    const topic = String(config?.topic || '')
    const accessToken = secrets.accessToken ? String(secrets.accessToken) : undefined
    return buildNtfyUrl(serverUrl, topic, accessToken)
  }

  if (provider === 'PUSHOVER') {
    return buildPushoverUrl(String(secrets.userKey || ''), String(secrets.apiToken || ''))
  }

  if (provider === 'TELEGRAM') {
    return buildTelegramUrl(String(secrets.botToken || ''), String(config?.chatId || ''))
  }

  throw new Error(`Unsupported provider: ${provider}`)
}

function normalizeNotifyType(type?: string): 'info' | 'success' | 'warning' | 'failure' {
  if (type === 'success' || type === 'warning' || type === 'failure') return type
  return 'info'
}

function safeErrorMessage(result: { error?: string } | null): string | null {
  const msg = result?.error
  if (!msg) return null
  return msg.slice(0, 500)
}

export async function processExternalNotificationJob(data: ExternalNotificationJob, jobId?: string): Promise<void> {
  const startedAt = Date.now()
  const notifyType = normalizeNotifyType(data.notifyType)

  log(`Job ${jobId || '?'} started`, {
    eventType: data.eventType,
    notifyType,
    destinationIds: data.destinationIds?.length ? data.destinationIds.length : undefined,
    title: data.title,
    bodyPreview: data.body ? safeTextPreview(data.body, 140) : undefined,
  })

  const destinations = data.destinationIds?.length
    ? await prisma.notificationDestination.findMany({
        where: { id: { in: data.destinationIds } },
      })
    : await prisma.notificationDestination.findMany({
        where: {
          enabled: true,
          subscriptions: {
            some: {
              eventType: data.eventType,
              enabled: true,
            },
          },
        },
      })

  if (destinations.length === 0) {
    log(`Job ${jobId || '?'} skipped (no matching destinations)`, {
      eventType: data.eventType,
    })
    return
  }

  log(`Job ${jobId || '?'} sending`, {
    eventType: data.eventType,
    destinations: destinations.length,
  })

  let sentCount = 0
  let failedCount = 0

  for (const dest of destinations) {
    let success = false
    let error: string | null = null
    const destStartedAt = Date.now()

    try {
      const provider = dest.provider as Provider
      const secrets = parseSecrets(dest.secretsEncrypted)
      if (provider !== 'NTFY' && !secrets) {
        throw new Error('Missing notification secrets')
      }

      const url = buildAppriseUrl(provider, dest.config, secrets || {})
      const title = provider === 'TELEGRAM' ? normalizeTelegramText(data.title) : data.title
      const body = provider === 'TELEGRAM' ? normalizeTelegramText(data.body) : data.body

      const result = await sendAppriseNotification({
        urls: [url],
        title,
        body,
        notifyType,
        timeoutMs: 10_000,
      })

      success = !!result.success
      error = safeErrorMessage(result) || (success ? null : 'Notification failed')
      if (success) {
        sentCount += 1
        log(`Sent → ${dest.name}`, {
          provider,
          destinationId: dest.id,
          elapsedMs: Date.now() - destStartedAt,
          destinations: result.destinations,
        })
      } else {
        failedCount += 1
        logError(`Failed → ${dest.name}`, {
          provider,
          destinationId: dest.id,
          elapsedMs: Date.now() - destStartedAt,
          error: error || 'Notification failed',
          stderr: result.stderr ? safeTextPreview(result.stderr, 300) : undefined,
        })
      }
    } catch (err) {
      success = false
      error = err instanceof Error ? redactUrlSecrets(err.message) : 'Notification failed'
      failedCount += 1
      logError(`Failed → ${dest.name}`, {
        provider: dest.provider,
        destinationId: dest.id,
        elapsedMs: Date.now() - destStartedAt,
        error: error || 'Notification failed',
      })
    }

    await prisma.notificationDeliveryLog
      .create({
        data: {
          destinationId: dest.id,
          eventType: data.eventType,
          success,
          error,
        },
      })
      .catch(() => {
        // Avoid failing the job on log errors.
      })
  }

  log(`Job ${jobId || '?'} done`, {
    eventType: data.eventType,
    sent: sentCount,
    failed: failedCount,
    elapsedMs: Date.now() - startedAt,
  })
}
