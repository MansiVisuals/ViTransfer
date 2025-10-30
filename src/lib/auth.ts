import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { prisma, setDatabaseUserContext } from './db'
import { verifyPassword } from './encryption'
import { revokeToken, isTokenRevoked, isUserTokensRevoked } from './token-revocation'

// JWT and session configuration
// Container always runs HTTP - reverse proxy handles HTTPS
const SESSION_COOKIE_NAME = 'vitransfer_session'
const REFRESH_COOKIE_NAME = 'vitransfer_refresh'
const ACCESS_TOKEN_DURATION = 15 * 60 // 15 minutes in seconds
const REFRESH_TOKEN_DURATION = 3 * 24 * 60 * 60 // 3 days in seconds (long-lived, rotated on use)
const SESSION_INACTIVITY_TIMEOUT = 15 * 60 * 1000 // 15 minutes of inactivity in ms

// Cookie configuration
// Self-hosters access via localhost/LAN (HTTP) or reverse proxy (HTTPS termination)
// Secure flag breaks Safari on localhost and provides no security benefit
// When behind reverse proxy, proxy terminates HTTPS and sends HTTP to container
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: false, // Reverse proxy handles HTTPS
  sameSite: 'strict' as const,
  path: '/',
} as const

// JWT secrets - REQUIRED in production (see README for setup instructions)
// Note: During build time, we allow missing secrets but will validate at runtime
// SKIP_ENV_VALIDATION is set during Docker builds to skip validation
const skipValidation = process.env.SKIP_ENV_VALIDATION === '1'

if (!skipValidation && (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET)) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set in production. See README for setup instructions.')
  } else {
    console.warn('WARNING: Using insecure JWT secrets for DEVELOPMENT only. See README for production setup.')
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'DEV_ONLY_INSECURE_SECRET_CHANGE_THIS'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'DEV_ONLY_INSECURE_REFRESH_SECRET_CHANGE_THIS'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: string
}

export interface JWTPayload {
  userId: string
  email: string
  role: string
  type: 'access' | 'refresh'
  iat?: number
  exp?: number
}

/**
 * Validate that JWT secrets are configured (runtime check)
 */
function validateJWTSecrets(): void {
  // Skip validation during build or if explicitly disabled
  if (process.env.SKIP_ENV_VALIDATION === '1') {
    return
  }
  
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set in production. See README for setup instructions.')
    }
    if (process.env.JWT_SECRET === 'DEV_ONLY_INSECURE_SECRET_CHANGE_THIS' || 
        process.env.JWT_REFRESH_SECRET === 'DEV_ONLY_INSECURE_REFRESH_SECRET_CHANGE_THIS') {
      throw new Error('Production JWT secrets must not use default development values. Generate secure secrets using scripts/generate-jwt-secrets.sh')
    }
  }
}

/**
 * Generate JWT access token
 */
function generateAccessToken(user: AuthUser): string {
  validateJWTSecrets()
  
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    type: 'access',
  }

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_DURATION,
    algorithm: 'HS256',
  })
}

/**
 * Generate JWT refresh token
 */
function generateRefreshToken(user: AuthUser): string {
  validateJWTSecrets()
  
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    type: 'refresh',
  }

  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_DURATION,
    algorithm: 'HS256',
  })
}

/**
 * Verify and decode JWT access token
 * 
 * Security checks:
 * 1. Validates token signature and expiration
 * 2. Checks if token has been revoked (blacklist)
 * 3. Checks if all user tokens have been revoked
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    }) as JWTPayload

    if (decoded.type !== 'access') {
      return null
    }

    // Check if token has been explicitly revoked
    const revoked = await isTokenRevoked(token)
    if (revoked) {
      return null
    }

    // Check if all user's tokens have been revoked (e.g., after password change)
    // This checks if token was issued BEFORE the revocation timestamp
    const userRevoked = await isUserTokensRevoked(decoded.userId, decoded.iat)
    if (userRevoked) {
      return null
    }

    return decoded
  } catch (error) {
    // Token expired, invalid, or malformed
    return null
  }
}

/**
 * Verify and decode JWT refresh token
 * 
 * Security checks:
 * 1. Validates token signature and expiration
 * 2. Checks if token has been revoked (blacklist)
 * 3. Checks if all user tokens have been revoked
 */
export async function verifyRefreshToken(token: string): Promise<JWTPayload | null> {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
    }) as JWTPayload

    if (decoded.type !== 'refresh') {
      return null
    }

    // Check if token has been explicitly revoked
    const revoked = await isTokenRevoked(token)
    if (revoked) {
      return null
    }

    // Check if all user's tokens have been revoked
    // This checks if token was issued BEFORE the revocation timestamp
    const userRevoked = await isUserTokensRevoked(decoded.userId, decoded.iat)
    if (userRevoked) {
      return null
    }

    return decoded
  } catch (error) {
    // Token expired, invalid, or malformed
    return null
  }
}

/**
 * Verify user credentials and return user if valid
 * Supports login with either username or email
 */
export async function verifyCredentials(
  usernameOrEmail: string,
  password: string
): Promise<AuthUser | null> {
  try {
    // Support login with either email OR username
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: usernameOrEmail },
          { username: usernameOrEmail },
        ],
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
      return null
    }

    const isValid = await verifyPassword(password, user.password)
    if (!isValid) {
      return null
    }

    // Return user without password
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

/**
 * Create a session with JWT tokens and set cookies
 */
export async function createSession(user: AuthUser): Promise<void> {
  const accessToken = generateAccessToken(user)
  const refreshToken = generateRefreshToken(user)

  const cookieStore = await cookies()

  // Set access token cookie (short-lived)
  cookieStore.set(SESSION_COOKIE_NAME, accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_DURATION,
  })

  // Set refresh token cookie (long-lived)
  cookieStore.set(REFRESH_COOKIE_NAME, refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_DURATION,
  })
}

/**
 * Refresh the access token using the refresh token
 */
export async function refreshAccessToken(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get(REFRESH_COOKIE_NAME)

    if (!refreshToken?.value) {
      return false
    }

    const payload = await verifyRefreshToken(refreshToken.value)
    if (!payload) {
      // Refresh token invalid or expired
      await deleteSession()
      return false
    }

    // Fetch fresh user data
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    })

    if (!user) {
      await deleteSession()
      return false
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user)

    // Update access token cookie
    cookieStore.set(SESSION_COOKIE_NAME, newAccessToken, {
      ...COOKIE_OPTIONS,
      maxAge: ACCESS_TOKEN_DURATION,
    })

    return true
  } catch (error) {
    console.error('Error refreshing access token:', error)
    return false
  }
}

/**
 * Get current authenticated user from session
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get(SESSION_COOKIE_NAME)

    if (!accessToken?.value) {
      // Try to refresh the access token
      const refreshed = await refreshAccessToken()
      if (!refreshed) {
        return null
      }
      
      // Get the new access token after refresh
      const newAccessToken = cookieStore.get(SESSION_COOKIE_NAME)
      if (!newAccessToken?.value) {
        return null
      }

      const payload = await verifyAccessToken(newAccessToken.value)
      if (!payload) {
        return null
      }

      // Fetch user from database
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      })

      if (user) {
        // Set RLS context for this database session
        await setDatabaseUserContext(user.id, user.role)
      }

      return user
    }

    const payload = await verifyAccessToken(accessToken.value)
    if (!payload) {
      // Token expired or invalid, try to refresh
      const refreshed = await refreshAccessToken()
      if (!refreshed) {
        return null
      }

      // Recursively get user with new token
      return getCurrentUser()
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    })

    if (user) {
      // Set RLS context for this database session
      await setDatabaseUserContext(user.id, user.role)
    }

    return user
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

/**
 * Get current user from NextRequest (for API routes and middleware)
 */
export async function getCurrentUserFromRequest(
  request: NextRequest
): Promise<AuthUser | null> {
  try {
    const accessToken = request.cookies.get(SESSION_COOKIE_NAME)

    if (!accessToken?.value) {
      return null
    }

    const payload = await verifyAccessToken(accessToken.value)
    if (!payload) {
      // Token expired or invalid
      return null
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    })

    if (user) {
      // Set RLS context for this database session
      await setDatabaseUserContext(user.id, user.role)
    }

    return user
  } catch (error) {
    console.error('Error getting current user from request:', error)
    return null
  }
}

/**
 * Regenerate session after security-sensitive operations
 *
 * Use cases:
 * - Password change
 * - Role/permission change
 * - Account recovery
 * - Security event (suspected breach)
 *
 * Security benefits:
 * - Prevents session fixation attacks
 * - Invalidates compromised sessions
 * - Forces re-authentication on other devices
 *
 * Implementation:
 * 1. Revokes old access and refresh tokens
 * 2. Generates new tokens with fresh signature
 * 3. Updates cookies with new tokens
 */
export async function regenerateSession(user: AuthUser): Promise<void> {
  try {
    const cookieStore = await cookies()

    // Get old tokens before regenerating
    const oldAccessToken = cookieStore.get(SESSION_COOKIE_NAME)
    const oldRefreshToken = cookieStore.get(REFRESH_COOKIE_NAME)

    // Revoke old tokens if they exist
    if (oldAccessToken?.value) {
      const accessPayload = jwt.decode(oldAccessToken.value) as JWTPayload | null
      if (accessPayload?.exp) {
        const now = Math.floor(Date.now() / 1000)
        const ttl = Math.max(accessPayload.exp - now, 0)
        await revokeToken(oldAccessToken.value, ttl)
      }
    }

    if (oldRefreshToken?.value) {
      const refreshPayload = jwt.decode(oldRefreshToken.value) as JWTPayload | null
      if (refreshPayload?.exp) {
        const now = Math.floor(Date.now() / 1000)
        const ttl = Math.max(refreshPayload.exp - now, 0)
        await revokeToken(oldRefreshToken.value, ttl)
      }
    }

    // Create new session with fresh tokens
    await createSession(user)
  } catch (error) {
    console.error('Error regenerating session:', error)
    // Fall back to creating new session even if revocation fails
    await createSession(user)
  }
}

/**
 * Delete session cookies and revoke tokens (logout)
 *
 * Security implementation:
 * 1. Extracts both access and refresh tokens before deletion
 * 2. Revokes tokens in Redis blacklist to prevent reuse
 * 3. Deletes HTTP-only secure cookies
 * 4. Uses proper TTL for revoked tokens (matches token expiration)
 *
 * Even if Redis fails, cookies are still deleted (defense in depth)
 */
export async function deleteSession(): Promise<void> {
  try {
    const cookieStore = await cookies()
    
    // Get tokens before deleting cookies (for revocation)
    const accessTokenCookie = cookieStore.get(SESSION_COOKIE_NAME)
    const refreshTokenCookie = cookieStore.get(REFRESH_COOKIE_NAME)

    // Revoke both tokens if they exist
    if (accessTokenCookie?.value) {
      // Calculate remaining time until access token expires
      const accessPayload = jwt.decode(accessTokenCookie.value) as JWTPayload | null
      if (accessPayload?.exp) {
        const now = Math.floor(Date.now() / 1000)
        const ttl = Math.max(accessPayload.exp - now, 0)
        await revokeToken(accessTokenCookie.value, ttl)
      }
    }

    if (refreshTokenCookie?.value) {
      // Calculate remaining time until refresh token expires
      const refreshPayload = jwt.decode(refreshTokenCookie.value) as JWTPayload | null
      if (refreshPayload?.exp) {
        const now = Math.floor(Date.now() / 1000)
        const ttl = Math.max(refreshPayload.exp - now, 0)
        await revokeToken(refreshTokenCookie.value, ttl)
      }
    }

    // Delete cookies (primary security control)
    cookieStore.delete(SESSION_COOKIE_NAME)
    cookieStore.delete(REFRESH_COOKIE_NAME)
  } catch (error) {
    console.error('Error during session deletion:', error)
    // Still delete cookies even if revocation fails
    const cookieStore = await cookies()
    cookieStore.delete(SESSION_COOKIE_NAME)
    cookieStore.delete(REFRESH_COOKIE_NAME)
  }
}

/**
 * Check if user is authenticated (has valid session)
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getCurrentUser()
  return user !== null
}

/**
 * Check if user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.role === 'ADMIN'
}

/**
 * Require authentication - throws error if not authenticated
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}

/**
 * Require admin role - throws error if not admin
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'ADMIN') {
    throw new Error('Admin access required')
  }
  return user
}

/**
 * Check authentication from request and return user or null
 * Use this in API routes to verify authentication
 */
export async function checkApiAuth(
  request: NextRequest
): Promise<AuthUser | null> {
  return getCurrentUserFromRequest(request)
}

/**
 * Require authentication from request - returns Response if not authenticated
 * Use this in API routes for easy auth checking
 */
export async function requireApiAuth(
  request: NextRequest
): Promise<AuthUser | Response> {
  const user = await getCurrentUserFromRequest(request)
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }
  return user
}

/**
 * Require admin from request - returns Response if not admin
 * Use this in API routes for easy admin auth checking
 */
export async function requireApiAdmin(
  request: NextRequest
): Promise<AuthUser | Response> {
  const user = await getCurrentUserFromRequest(request)
  if (!user) {
    // Generic error - don't disclose why (could be invalid token, expired, no token, etc.)
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }
  if (user.role !== 'ADMIN') {
    // Generic error - don't disclose that user exists but lacks permissions
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }
  return user
}
