/**
 * WebAuthn/PassKey Authentication Library
 *
 * Implements secure PassKey authentication using SimpleWebAuthn
 * Following official patterns from https://simplewebauthn.dev/docs/
 *
 * Security Features:
 * 1. Challenge stored in Redis with 5-minute TTL
 * 2. One-time use challenges (deleted after verification)
 * 3. Signature counter prevents replay attacks
 * 4. Strict domain/origin validation from Settings
 * 5. Fail-closed on configuration errors
 * 6. Rate limiting integration (reuses existing infrastructure)
 *
 * Challenge Lifecycle (Critical for Security):
 * 1. Generate options → store challenge in Redis
 * 2. User completes WebAuthn ceremony
 * 3. Verify response → retrieve challenge from Redis
 * 4. Delete challenge IMMEDIATELY (even if verification fails)
 * 5. This prevents replay attacks
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from '@simplewebauthn/server'
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { prisma } from './db'
import { getRedis } from './token-revocation'
import { getWebAuthnConfig } from './settings'
import { logSecurityEvent } from './video-access'
import type { AuthUser } from './auth'

/**
 * Challenge storage constants
 */
const CHALLENGE_TTL = 5 * 60 // 5 minutes in seconds
const CHALLENGE_PREFIX_REGISTER = 'passkey:challenge:register:'
const CHALLENGE_PREFIX_AUTH = 'passkey:challenge:auth:'

/**
 * Generate friendly device name from user agent
 */
function generateDeviceName(userAgent?: string): string {
  if (!userAgent) return 'Unknown Device'

  const ua = userAgent.toLowerCase()

  // Detect device/OS
  if (ua.includes('iphone')) return 'iPhone'
  if (ua.includes('ipad')) return 'iPad'
  if (ua.includes('android')) return 'Android Device'
  if (ua.includes('mac')) return 'Mac'
  if (ua.includes('windows')) return 'Windows PC'
  if (ua.includes('linux')) return 'Linux Device'

  return 'Unknown Device'
}

/**
 * Store challenge in Redis with short TTL
 *
 * @param userId - User ID (for registration) or email (for authentication)
 * @param challenge - Base64URL encoded challenge
 * @param type - 'register' or 'auth'
 */
async function storeChallenge(
  userId: string,
  challenge: string,
  type: 'register' | 'auth'
): Promise<void> {
  const redis = getRedis()
  const prefix = type === 'register' ? CHALLENGE_PREFIX_REGISTER : CHALLENGE_PREFIX_AUTH
  const key = `${prefix}${userId}`

  await redis.setex(key, CHALLENGE_TTL, challenge)
}

/**
 * Retrieve and DELETE challenge from Redis (one-time use)
 *
 * SECURITY: Challenge is deleted regardless of whether it's valid
 * This prevents replay attacks
 *
 * @param userId - User ID or email
 * @param type - 'register' or 'auth'
 * @returns Challenge string or null if not found/expired
 */
async function retrieveAndDeleteChallenge(
  userId: string,
  type: 'register' | 'auth'
): Promise<string | null> {
  const redis = getRedis()
  const prefix = type === 'register' ? CHALLENGE_PREFIX_REGISTER : CHALLENGE_PREFIX_AUTH
  const key = `${prefix}${userId}`

  // Get challenge
  const challenge = await redis.get(key)

  // Delete immediately (even if null) to prevent replay
  await redis.del(key)

  return challenge
}

/**
 * Generate PassKey registration options
 *
 * SECURITY: Requires authenticated user (can only register passkeys for yourself)
 *
 * @param user - Authenticated user
 * @returns Registration options to send to browser
 */
export async function generatePasskeyRegistrationOptions(
  user: AuthUser
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  // Get WebAuthn configuration (throws if not configured)
  const { rpID, rpName } = await getWebAuthnConfig()

  // Get user's existing passkeys to exclude them
  const existingPasskeys = await prisma.passkeyCredential.findMany({
    where: { userId: user.id },
    select: {
      credentialID: true,
      transports: true,
    },
  })

  // Generate registration options
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.name || user.email,

    // Exclude existing credentials (prevent duplicate registrations)
    excludeCredentials: existingPasskeys.map((passkey) => ({
      id: isoBase64URL.fromBuffer(passkey.credentialID),
      transports: passkey.transports as AuthenticatorTransport[],
    })),

    // Security settings (following SimpleWebAuthn recommendations)
    attestationType: 'none', // Simpler UX, no privacy concerns
    authenticatorSelection: {
      residentKey: 'required', // Enables usernameless auth
      userVerification: 'preferred', // Better UX than 'required'
    },

    // Support ES256 and RS256 algorithms
    supportedAlgorithmIDs: [-7, -257],
  })

  // Store challenge for verification (5-minute TTL)
  await storeChallenge(user.id, options.challenge, 'register')

  return options
}

/**
 * Verify PassKey registration response
 *
 * @param user - Authenticated user
 * @param response - Registration response from browser
 * @param userAgent - User agent string for tracking
 * @param ipAddress - IP address for security tracking
 * @returns Credential ID if successful, null otherwise
 */
export async function verifyPasskeyRegistration(
  user: AuthUser,
  response: RegistrationResponseJSON,
  userAgent?: string,
  ipAddress?: string
): Promise<{ success: boolean; credentialId?: string; error?: string }> {
  try {
    // Get WebAuthn configuration
    const { rpID, origins } = await getWebAuthnConfig()

    // Retrieve and delete challenge (one-time use)
    const expectedChallenge = await retrieveAndDeleteChallenge(user.id, 'register')

    if (!expectedChallenge) {
      return {
        success: false,
        error: 'Challenge expired or invalid. Please try again.',
      }
    }

    // Verify registration response
    const verification: VerifiedRegistrationResponse = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: false, // 'preferred' on client, not required
    })

    if (!verification.verified || !verification.registrationInfo) {
      return {
        success: false,
        error: 'PassKey registration failed verification.',
      }
    }

    const { registrationInfo } = verification
    const {
      credential,
      credentialDeviceType,
      credentialBackedUp,
      aaguid,
    } = registrationInfo

    // Store credential in database
    // credential.id is base64url string in v11+, publicKey is Uint8Array
    const passkeyCredential = await prisma.passkeyCredential.create({
      data: {
        userId: user.id,
        credentialID: Buffer.from(credential.id, 'base64url'),
        publicKey: credential.publicKey,
        counter: BigInt(credential.counter),
        transports: credential.transports || [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        aaguid: aaguid || null,
        userAgent: userAgent || null,
        lastUsedIP: ipAddress || null,
        credentialName: generateDeviceName(userAgent),
      },
    })

    // Log successful registration
    await logSecurityEvent({
      type: 'PASSKEY_REGISTERED',
      severity: 'INFO',
      ipAddress,
      details: {
        userId: user.id,
        email: user.email,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: response.response.transports || [],
      },
    })

    return {
      success: true,
      credentialId: passkeyCredential.id,
    }
  } catch (error) {
    console.error('[PASSKEY] Registration verification error:', error)

    // Log failed registration attempt with full details
    await logSecurityEvent({
      type: 'PASSKEY_REGISTRATION_FAILED',
      severity: 'WARNING',
      ipAddress,
      details: {
        userId: user.id,
        email: user.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    })

    // Return generic error to prevent information disclosure
    return {
      success: false,
      error: 'PassKey registration failed. Please try again.',
    }
  }
}

/**
 * Generate PassKey authentication options
 *
 * @param email - User email (optional for usernameless auth)
 * @returns Authentication options to send to browser
 */
export async function generatePasskeyAuthenticationOptions(
  email?: string
): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; sessionId?: string }> {
  // Get WebAuthn configuration
  const { rpID } = await getWebAuthnConfig()

  let user
  let challengeKey: string
  let sessionId: string | undefined

  if (email) {
    // Standard authentication (with email)
    user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        passkeys: {
          select: {
            credentialID: true,
            transports: true,
          },
        },
      },
    })

    if (!user || user.passkeys.length === 0) {
      throw new Error('No passkeys registered for this account')
    }

    challengeKey = user.id
  } else {
    // Usernameless authentication (discoverable credentials)
    // Generate secure session ID for challenge storage
    sessionId = `usernameless:${Date.now()}:${crypto.randomUUID()}`
    challengeKey = sessionId
  }

  // Generate authentication options
  const options = await generateAuthenticationOptions({
    rpID,

    // For usernameless auth, allow any credential
    // For standard auth, specify user's credentials
    allowCredentials: user
      ? user.passkeys.map((passkey) => ({
          id: isoBase64URL.fromBuffer(passkey.credentialID),
          type: 'public-key' as const,
          transports: passkey.transports as AuthenticatorTransport[],
        }))
      : [],

    userVerification: 'preferred',
  })

  // Store challenge for verification
  await storeChallenge(challengeKey, options.challenge, 'auth')

  return {
    options,
    sessionId, // Return sessionId for usernameless auth
  }
}

/**
 * Verify PassKey authentication response
 *
 * SECURITY: This is the main authentication gate
 * - Verifies signature using stored public key
 * - Checks signature counter (replay attack prevention)
 * - Updates counter and last used tracking
 *
 * @param response - Authentication response from browser
 * @param email - User email (if known)
 * @param ipAddress - IP address for security tracking
 * @returns AuthUser if successful, null otherwise
 */
export async function verifyPasskeyAuthentication(
  response: AuthenticationResponseJSON,
  sessionId?: string,
  ipAddress?: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  try {
    // Get WebAuthn configuration
    const { rpID, origins } = await getWebAuthnConfig()

    // Find credential by ID
    // response.id is base64url-encoded credential ID from browser
    const credentialID = Buffer.from(response.id, 'base64url')
    const credential = await prisma.passkeyCredential.findUnique({
      where: { credentialID },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    })

    if (!credential) {
      return {
        success: false,
        error: 'PassKey not found.',
      }
    }

    // Retrieve and delete challenge
    // For usernameless: use sessionId, for standard: use user ID
    const challengeKey = sessionId || credential.user.id
    const expectedChallenge = await retrieveAndDeleteChallenge(challengeKey, 'auth')

    if (!expectedChallenge) {
      return {
        success: false,
        error: 'Challenge expired or invalid. Please try again.',
      }
    }

    // Verify authentication response
    const verification: VerifiedAuthenticationResponse = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      credential: {
        id: isoBase64URL.fromBuffer(credential.credentialID),
        publicKey: credential.publicKey,
        counter: Number(credential.counter),
        transports: credential.transports as AuthenticatorTransport[],
      },
      requireUserVerification: false,
    })

    if (!verification.verified) {
      return {
        success: false,
        error: 'PassKey authentication failed verification.',
      }
    }

    // Update credential counter and last used timestamp
    await prisma.passkeyCredential.update({
      where: { id: credential.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
        lastUsedIP: ipAddress || null,
      },
    })

    // Log successful authentication
    await logSecurityEvent({
      type: 'PASSKEY_LOGIN_SUCCESS',
      severity: 'INFO',
      ipAddress,
      details: {
        userId: credential.user.id,
        email: credential.user.email,
        credentialId: credential.id,
        deviceType: credential.deviceType,
      },
    })

    return {
      success: true,
      user: {
        id: credential.user.id,
        email: credential.user.email,
        name: credential.user.name,
        role: credential.user.role,
      },
    }
  } catch (error) {
    console.error('[PASSKEY] Authentication verification error:', error)

    // Log failed authentication attempt with full details
    await logSecurityEvent({
      type: 'PASSKEY_LOGIN_FAILED',
      severity: 'WARNING',
      ipAddress,
      details: {
        usernameless: !sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    })

    // Return generic error to prevent information disclosure
    return {
      success: false,
      error: 'PassKey authentication failed. Please try again.',
    }
  }
}

/**
 * Get user's registered passkeys
 *
 * @param userId - User ID
 * @returns List of passkeys with metadata
 */
export async function getUserPasskeys(userId: string) {
  return prisma.passkeyCredential.findMany({
    where: { userId },
    select: {
      id: true,
      credentialName: true,
      deviceType: true,
      backedUp: true,
      transports: true,
      userAgent: true,
      createdAt: true,
      lastUsedAt: true,
      lastUsedIP: true,
    },
    orderBy: {
      lastUsedAt: 'desc',
    },
  })
}

/**
 * Delete a passkey
 *
 * SECURITY: Users can only delete their own passkeys
 *
 * @param userId - User ID
 * @param credentialId - Credential ID to delete
 * @returns Success status
 */
export async function deletePasskey(
  userId: string,
  credentialId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify ownership
    const credential = await prisma.passkeyCredential.findUnique({
      where: { id: credentialId },
      select: {
        userId: true,
        deviceType: true,
        credentialName: true,
      },
    })

    if (!credential) {
      return { success: false, error: 'PassKey not found' }
    }

    if (credential.userId !== userId) {
      // Log unauthorized deletion attempt
      await logSecurityEvent({
        type: 'PASSKEY_DELETE_UNAUTHORIZED',
        severity: 'CRITICAL',
        details: {
          attemptedBy: userId,
          credentialOwnerId: credential.userId,
          credentialId,
        },
      })
      return { success: false, error: 'Unauthorized' }
    }

    await prisma.passkeyCredential.delete({
      where: { id: credentialId },
    })

    // Log successful deletion
    await logSecurityEvent({
      type: 'PASSKEY_DELETED',
      severity: 'INFO',
      details: {
        userId,
        credentialId,
        deviceType: credential.deviceType,
        credentialName: credential.credentialName,
      },
    })

    return { success: true }
  } catch (error) {
    console.error('[PASSKEY] Delete error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete passkey',
    }
  }
}

/**
 * Update passkey name (user-friendly label)
 *
 * @param userId - User ID
 * @param credentialId - Credential ID
 * @param name - New name
 */
export async function updatePasskeyName(
  userId: string,
  credentialId: string,
  name: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify ownership
    const credential = await prisma.passkeyCredential.findUnique({
      where: { id: credentialId },
      select: { userId: true },
    })

    if (!credential) {
      return { success: false, error: 'PassKey not found' }
    }

    if (credential.userId !== userId) {
      return { success: false, error: 'Unauthorized' }
    }

    await prisma.passkeyCredential.update({
      where: { id: credentialId },
      data: { credentialName: name },
    })

    return { success: true }
  } catch (error) {
    console.error('[PASSKEY] Update name error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update passkey name',
    }
  }
}
