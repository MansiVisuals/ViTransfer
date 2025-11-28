import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { prisma, setDatabaseUserContext } from './db'
import { verifyPassword } from './encryption'
import { revokeToken, isTokenRevoked, isUserTokensRevoked } from './token-revocation'
import { getRedis } from './redis'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: string
}

type TokenKind = 'admin_access' | 'admin_refresh' | 'share'

interface AdminAccessPayload extends jwt.JwtPayload {
  type: 'admin_access'
  userId: string
  email: string
  role: string
  sessionId: string
}

interface AdminRefreshPayload extends jwt.JwtPayload {
  type: 'admin_refresh'
  userId: string
  email: string
  role: string
  sessionId: string
  rotationId: string
}

interface SharePayload extends jwt.JwtPayload {
  type: 'share'
  shareId: string
  projectId: string
  permissions: string[]
  sessionId: string
  guest: boolean
  recipientId?: string
  authMode?: string
  adminOverride?: boolean
}

const ADMIN_ACCESS_SECRET = process.env.JWT_SECRET
const ADMIN_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET
const SHARE_TOKEN_SECRET = process.env.SHARE_TOKEN_SECRET || ADMIN_ACCESS_SECRET

const ACCESS_TOKEN_DURATION = Number(process.env.ADMIN_ACCESS_TTL_SECONDS || 15 * 60) // 15 minutes
const REFRESH_TOKEN_DURATION = Number(process.env.ADMIN_REFRESH_TTL_SECONDS || 7 * 24 * 60 * 60) // 7 days
const SHARE_TOKEN_DURATION = Number(process.env.SHARE_TOKEN_TTL_SECONDS || 45 * 60) // 45 minutes
const DUMMY_BCRYPT_HASH = '$2a$14$aoLibk0GEJrzo6fSqPoQIONMGynUKWEoQhkCrFcEapn6I.WzXXdki'

if (process.env.SKIP_ENV_VALIDATION !== '1') {
  if (!ADMIN_ACCESS_SECRET || !ADMIN_REFRESH_SECRET || !SHARE_TOKEN_SECRET) {
    throw new Error('JWT secrets must be configured (JWT_SECRET, JWT_REFRESH_SECRET, SHARE_TOKEN_SECRET).')
  }
}

function signAdminAccess(user: AuthUser, sessionId: string): string {
  if (!ADMIN_ACCESS_SECRET) throw new Error('JWT_SECRET missing')
  const payload: AdminAccessPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionId,
    type: 'admin_access',
  }
  return jwt.sign(payload, ADMIN_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_DURATION, algorithm: 'HS256' })
}

function signAdminRefresh(user: AuthUser, sessionId: string, rotationId: string): string {
  if (!ADMIN_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET missing')
  const payload: AdminRefreshPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionId,
    rotationId,
    type: 'admin_refresh',
  }
  return jwt.sign(payload, ADMIN_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_DURATION, algorithm: 'HS256' })
}

export function signShareToken(params: {
  shareId: string
  projectId: string
  permissions: string[]
  guest: boolean
  sessionId?: string
  recipientId?: string
  authMode?: string
  adminOverride?: boolean
  ttlSeconds?: number
}): string {
  if (!SHARE_TOKEN_SECRET) throw new Error('SHARE_TOKEN_SECRET missing')
  const sessionId = params.sessionId || crypto.randomBytes(16).toString('base64url')
  const payload: SharePayload = {
    type: 'share',
    shareId: params.shareId,
    projectId: params.projectId,
    permissions: params.permissions,
    guest: params.guest,
    sessionId,
    recipientId: params.recipientId,
    authMode: params.authMode,
    adminOverride: params.adminOverride,
  }
  return jwt.sign(payload, SHARE_TOKEN_SECRET, {
    expiresIn: params.ttlSeconds || SHARE_TOKEN_DURATION,
    algorithm: 'HS256',
  })
}

export async function verifyAdminAccessToken(token: string): Promise<AdminAccessPayload | null> {
  try {
    if (!ADMIN_ACCESS_SECRET) return null
    const decoded = jwt.verify(token, ADMIN_ACCESS_SECRET, { algorithms: ['HS256'] }) as AdminAccessPayload
    if (decoded.type !== 'admin_access') return null
    if (await isTokenRevoked(token)) return null
    if (await isUserTokensRevoked(decoded.userId, decoded.iat)) return null
    return decoded
  } catch {
    return null
  }
}

export async function verifyAdminRefreshToken(token: string): Promise<AdminRefreshPayload | null> {
  try {
    if (!ADMIN_REFRESH_SECRET) return null
    const decoded = jwt.verify(token, ADMIN_REFRESH_SECRET, { algorithms: ['HS256'] }) as AdminRefreshPayload
    if (decoded.type !== 'admin_refresh') return null
    if (await isTokenRevoked(token)) return null
    if (await isUserTokensRevoked(decoded.userId, decoded.iat)) return null
    return decoded
  } catch {
    return null
  }
}

export async function verifyShareToken(token: string): Promise<SharePayload | null> {
  try {
    if (!SHARE_TOKEN_SECRET) return null
    const decoded = jwt.verify(token, SHARE_TOKEN_SECRET, { algorithms: ['HS256'] }) as SharePayload
    if (decoded.type !== 'share') return null
    if (await isTokenRevoked(token)) return null
    return decoded
  } catch {
    return null
  }
}

export function parseBearerToken(request: NextRequest, headerName: string = 'authorization'): string | null {
  const header = request.headers.get(headerName)
  if (!header) return null
  const [scheme, value] = header.split(' ')
  if (!value || scheme.toLowerCase() !== 'bearer') return null
  return value.trim()
}

export async function issueAdminTokens(user: AuthUser, fingerprintHash?: string) {
  const sessionId = crypto.randomUUID()
  const rotationId = crypto.randomUUID()
  const accessToken = signAdminAccess(user, sessionId)
  const refreshToken = signAdminRefresh(user, sessionId, rotationId)

  if (fingerprintHash) {
    await storeTokenFingerprint(user.id, refreshToken, fingerprintHash)
  }

  return {
    accessToken,
    refreshToken,
    accessExpiresAt: Date.now() + ACCESS_TOKEN_DURATION * 1000,
    refreshExpiresAt: Date.now() + REFRESH_TOKEN_DURATION * 1000,
    sessionId,
  }
}

export async function refreshAdminTokens(params: {
  refreshToken: string
  fingerprintHash?: string
}) {
  const { refreshToken, fingerprintHash } = params
  const payload = await verifyAdminRefreshToken(refreshToken)
  if (!payload) return null

  if (fingerprintHash) {
    const storedFingerprint = await getTokenFingerprint(payload.userId, refreshToken)
    if (storedFingerprint && storedFingerprint !== fingerprintHash) {
      await revokeToken(refreshToken, remainingTtl(refreshToken, ADMIN_REFRESH_SECRET))
      await revokeTokenFamily(payload.userId)
      return null
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, role: true },
  })
  if (!user) {
    await revokeToken(refreshToken, remainingTtl(refreshToken, ADMIN_REFRESH_SECRET))
    return null
  }

  const rotationId = crypto.randomUUID()
  const accessToken = signAdminAccess(user, payload.sessionId)
  const newRefreshToken = signAdminRefresh(user, payload.sessionId, rotationId)

  // Revoke old refresh token on rotation
  await revokeToken(refreshToken, remainingTtl(refreshToken, ADMIN_REFRESH_SECRET))
  if (fingerprintHash) {
    await storeTokenFingerprint(user.id, newRefreshToken, fingerprintHash)
  }

  return {
    accessToken,
    refreshToken: newRefreshToken,
    accessExpiresAt: Date.now() + ACCESS_TOKEN_DURATION * 1000,
    refreshExpiresAt: Date.now() + REFRESH_TOKEN_DURATION * 1000,
    sessionId: payload.sessionId,
  }
}

export async function revokeTokenFamily(userId: string) {
  // Reuse user-level revocation for blast radius control
  const redis = getRedis()
  await redis.setex(`blacklist:user:${userId}`, REFRESH_TOKEN_DURATION, Date.now().toString())
}

export async function revokePresentedTokens(tokens: { accessToken?: string | null; refreshToken?: string | null }) {
  const { accessToken, refreshToken } = tokens

  if (accessToken) {
    await revokeToken(accessToken, remainingTtl(accessToken, ADMIN_ACCESS_SECRET))
  }
  if (refreshToken) {
    await revokeToken(refreshToken, remainingTtl(refreshToken, ADMIN_REFRESH_SECRET))
  }
}

export async function verifyCredentials(usernameOrEmail: string, password: string): Promise<AuthUser | null> {
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: usernameOrEmail }, { username: usernameOrEmail }],
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        password: true,
      },
    })

    if (!user) {
      await verifyPassword(password, DUMMY_BCRYPT_HASH)
      return null
    }

    const isValid = await verifyPassword(password, user.password)
    if (!isValid) {
      return null
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    }
  } catch (error) {
    console.error('Error verifying credentials:', error)
    return null
  }
}

export async function getCurrentUserFromRequest(request: NextRequest): Promise<AuthUser | null> {
  const bearer = parseBearerToken(request)
  if (!bearer) return null
  const payload = await verifyAdminAccessToken(bearer)
  if (!payload) return null

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, role: true },
  })

  if (user) {
    await setDatabaseUserContext(user.id, user.role)
  }

  return user
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const headerStore = await headers()
  const bearerHeader = headerStore.get('authorization')
  if (!bearerHeader) return null
  const [scheme, token] = bearerHeader.split(' ')
  if (!token || scheme.toLowerCase() !== 'bearer') return null
  const payload = await verifyAdminAccessToken(token)
  if (!payload) return null

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, role: true },
  })

  if (user) {
    await setDatabaseUserContext(user.id, user.role)
  }

  return user
}

export async function requireApiAdmin(request: NextRequest): Promise<AuthUser | Response> {
  const user = await getCurrentUserFromRequest(request)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return user
}

export async function requireApiAuth(request: NextRequest): Promise<AuthUser | Response> {
  const user = await getCurrentUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return user
}

export async function getShareContext(request: NextRequest): Promise<SharePayload | null> {
  const bearer = parseBearerToken(request)
  if (!bearer) return null
  return verifyShareToken(bearer)
}

/**
 * Get complete authentication context for a request
 *
 * Preferred method for dual-auth routes (admin + share token support).
 * Returns all auth information in a single call, preventing redundant lookups.
 *
 * @param request - NextRequest object
 * @returns Object containing user, isAdmin flag, and share context
 */
export async function getAuthContext(request: NextRequest): Promise<{
  user: AuthUser | null
  isAdmin: boolean
  shareContext: SharePayload | null
}> {
  const user = await getCurrentUserFromRequest(request)
  const shareContext = await getShareContext(request)
  const isAdmin = user?.role === 'ADMIN'

  return { user, isAdmin, shareContext }
}

export async function getAdminOverrideFromRequest(request: NextRequest): Promise<AuthUser | null> {
  const adminHeader = parseBearerToken(request, 'x-admin-authorization')
  if (!adminHeader) return null
  const payload = await verifyAdminAccessToken(adminHeader)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, role: true },
  })
  if (user) {
    await setDatabaseUserContext(user.id, user.role)
  }
  return user
}

export async function requireShareToken(request: NextRequest) {
  const token = await getShareContext(request)
  if (!token) {
    return NextResponse.json({ error: 'Share token required' }, { status: 401 })
  }
  return token
}

function remainingTtl(token: string, secret: string | undefined | null): number {
  if (!secret) return 0
  const decoded = jwt.decode(token) as jwt.JwtPayload | null
  if (!decoded?.exp) return 0
  const now = Math.floor(Date.now() / 1000)
  return Math.max(decoded.exp - now, 0)
}

async function storeTokenFingerprint(userId: string, refreshToken: string, fingerprintHash: string): Promise<void> {
  try {
    const redis = getRedis()
    const key = `token_fingerprint:${userId}:${hashToken(refreshToken)}`
    await redis.setex(key, REFRESH_TOKEN_DURATION, fingerprintHash)
  } catch (error) {
    console.error('[AUTH] Failed to store token fingerprint:', error)
  }
}

async function getTokenFingerprint(userId: string, refreshToken: string): Promise<string | null> {
  try {
    const redis = getRedis()
    const key = `token_fingerprint:${userId}:${hashToken(refreshToken)}`
    const fingerprint = await redis.get(key)
    return fingerprint
  } catch (error) {
    console.error('[AUTH] Failed to get token fingerprint:', error)
    return null
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('base64url')
}
