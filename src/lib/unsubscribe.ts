import { decrypt, encrypt } from './encryption'

type RecipientUnsubscribePayloadV1 = {
  v: 1
  t: 'recipient_unsubscribe'
  rid: string
  pid: string
  em: string
  exp: number
}

export function generateRecipientUnsubscribeToken(input: {
  recipientId: string
  projectId: string
  recipientEmail: string
  expiresInDays?: number
}): string {
  const expiresInDays = input.expiresInDays ?? 180
  const exp = Date.now() + expiresInDays * 24 * 60 * 60 * 1000

  const payload: RecipientUnsubscribePayloadV1 = {
    v: 1,
    t: 'recipient_unsubscribe',
    rid: input.recipientId,
    pid: input.projectId,
    em: input.recipientEmail.toLowerCase().trim(),
    exp,
  }

  return encrypt(JSON.stringify(payload))
}

export function verifyRecipientUnsubscribeToken(token: string): {
  recipientId: string
  projectId: string
  recipientEmail: string
} | null {
  try {
    const decoded = decrypt(token)
    const payload = JSON.parse(decoded) as Partial<RecipientUnsubscribePayloadV1>

    if (payload.v !== 1 || payload.t !== 'recipient_unsubscribe') return null
    if (typeof payload.rid !== 'string' || payload.rid.length === 0) return null
    if (typeof payload.pid !== 'string' || payload.pid.length === 0) return null
    if (typeof payload.em !== 'string' || payload.em.length === 0) return null
    if (typeof payload.exp !== 'number') return null
    if (Date.now() > payload.exp) return null

    return {
      recipientId: payload.rid,
      projectId: payload.pid,
      recipientEmail: payload.em,
    }
  } catch {
    return null
  }
}

export function buildUnsubscribeUrl(appUrl: string, token: string): string {
  const base = appUrl.replace(/\/$/, '')
  return `${base}/unsubscribe#token=${encodeURIComponent(token)}`
}
