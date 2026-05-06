import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { getRedis } from './redis'
import { getClientSessionTimeoutSeconds } from './settings'

export interface PortalSessionPayload extends jwt.JwtPayload {
  type: 'portal'
  email: string
  sessionId: string
}

// Portal sessions reuse SHARE_TOKEN_SECRET — the `type` discriminator on the
// JWT payload keeps portal and share tokens distinct (verifier rejects mismatches).
const PORTAL_TOKEN_SECRET = process.env.SHARE_TOKEN_SECRET

const DENYLIST_PREFIX = 'portal_denylist:'

export async function signPortalSession(email: string): Promise<{ token: string; sessionId: string; ttlSeconds: number }> {
  if (!PORTAL_TOKEN_SECRET) throw new Error('SHARE_TOKEN_SECRET missing')
  const ttlSeconds = await getClientSessionTimeoutSeconds()
  const sessionId = crypto.randomBytes(16).toString('base64url')
  const payload: PortalSessionPayload = {
    type: 'portal',
    email: email.toLowerCase().trim(),
    sessionId,
  }
  const token = jwt.sign(payload, PORTAL_TOKEN_SECRET, {
    expiresIn: ttlSeconds,
    algorithm: 'HS256',
  })
  return { token, sessionId, ttlSeconds }
}

export async function verifyPortalSession(token: string): Promise<PortalSessionPayload | null> {
  if (!PORTAL_TOKEN_SECRET) return null
  try {
    const decoded = jwt.verify(token, PORTAL_TOKEN_SECRET, { algorithms: ['HS256'] }) as PortalSessionPayload
    if (decoded.type !== 'portal') return null
    if (!decoded.sessionId || !decoded.email) return null
    if (await isPortalSessionRevoked(decoded.sessionId)) return null
    return decoded
  } catch {
    return null
  }
}

export async function revokePortalSession(sessionId: string, remainingSeconds: number): Promise<void> {
  if (!sessionId) return
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return
  const redis = getRedis()
  await redis.setex(`${DENYLIST_PREFIX}${sessionId}`, Math.ceil(remainingSeconds), '1')
}

export async function isPortalSessionRevoked(sessionId: string): Promise<boolean> {
  const redis = getRedis()
  const exists = await redis.exists(`${DENYLIST_PREFIX}${sessionId}`)
  return exists === 1
}

export function remainingPortalTokenSeconds(decoded: PortalSessionPayload): number {
  if (!decoded.exp) return 0
  const now = Math.floor(Date.now() / 1000)
  return Math.max(0, decoded.exp - now)
}
