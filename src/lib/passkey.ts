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
import { getRedis } from './redis'
import { getWebAuthnConfig } from './settings'
import { logSecurityEvent } from './video-access'
import { logError } from './logging'
import type { AuthUser } from './auth'

const CHALLENGE_TTL = 5 * 60 // 5 minutes in seconds
const CHALLENGE_PREFIX_REGISTER = 'passkey:challenge:register:'
const CHALLENGE_PREFIX_AUTH = 'passkey:challenge:auth:'

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

// SECURITY: Challenge is deleted regardless of validity to prevent replay attacks
async function retrieveAndDeleteChallenge(
  userId: string,
  type: 'register' | 'auth'
): Promise<string | null> {
  const redis = getRedis()
  const prefix = type === 'register' ? CHALLENGE_PREFIX_REGISTER : CHALLENGE_PREFIX_AUTH
  const key = `${prefix}${userId}`

  const challenge = await redis.get(key)
  await redis.del(key)

  return challenge
}

/** SECURITY: Requires authenticated user (can only register passkeys for yourself) */
export async function generatePasskeyRegistrationOptions(
  user: AuthUser
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID, rpName } = await getWebAuthnConfig()

  const existingPasskeys = await prisma.passkeyCredential.findMany({
    where: { userId: user.id },
    select: {
      credentialID: true,
      transports: true,
    },
  })

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

    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },

    supportedAlgorithmIDs: [-7, -257], // ES256 and RS256
  })

  await storeChallenge(user.id, options.challenge, 'register')

  return options
}

export async function verifyPasskeyRegistration(
  user: AuthUser,
  response: RegistrationResponseJSON,
  userAgent?: string,
  ipAddress?: string
): Promise<{ success: boolean; credentialId?: string; error?: string }> {
  try {
    const { rpID, origins } = await getWebAuthnConfig()

    const expectedChallenge = await retrieveAndDeleteChallenge(user.id, 'register')

    if (!expectedChallenge) {
      return {
        success: false,
        error: 'Challenge expired or invalid. Please try again.',
      }
    }

    const verification: VerifiedRegistrationResponse = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: false,
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
    logError('[PASSKEY] Registration verification error:', error)

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

    return {
      success: false,
      error: 'PassKey registration failed. Please try again.',
    }
  }
}

export async function generatePasskeyAuthenticationOptions(
  email?: string
): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; sessionId?: string }> {
  const { rpID } = await getWebAuthnConfig()

  let user
  let challengeKey: string
  let sessionId: string | undefined

  if (email) {

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

    if (user && user.passkeys.length > 0) {
      challengeKey = user.id
    } else {
      // SECURITY: Unknown user / no passkeys must be indistinguishable from a known user.
      user = null
      sessionId = `usernameless:${Date.now()}:${crypto.randomUUID()}`
      challengeKey = sessionId
    }
  } else {
    sessionId = `usernameless:${Date.now()}:${crypto.randomUUID()}`
    challengeKey = sessionId
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: user
      ? user.passkeys.map((passkey) => ({
          id: isoBase64URL.fromBuffer(passkey.credentialID),
          type: 'public-key' as const,
          transports: passkey.transports as AuthenticatorTransport[],
        }))
      : [],

    userVerification: 'preferred',
  })

  await storeChallenge(challengeKey, options.challenge, 'auth')

  return {
    options,
    sessionId,
  }
}

export async function verifyPasskeyAuthentication(
  response: AuthenticationResponseJSON,
  sessionId?: string,
  ipAddress?: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  try {
    const { rpID, origins } = await getWebAuthnConfig()

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

    const challengeKey = sessionId || credential.user.id
    const expectedChallenge = await retrieveAndDeleteChallenge(challengeKey, 'auth')

    if (!expectedChallenge) {
      return {
        success: false,
        error: 'Challenge expired or invalid. Please try again.',
      }
    }

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

    // WebAuthn signature counter regression check (clone detection).
    // Per WebAuthn §6.1.1: if either stored or new counter is non-zero, the new value
    // must strictly exceed the stored value. Both being 0 means the authenticator does
    // not implement counters (typical for platform authenticators) — accept those.
    const newCounter = verification.authenticationInfo.newCounter
    const storedCounter = Number(credential.counter)
    const counterTracked = storedCounter !== 0 || newCounter !== 0
    if (counterTracked && newCounter <= storedCounter) {
      await logSecurityEvent({
        type: 'PASSKEY_COUNTER_REGRESSION',
        severity: 'CRITICAL',
        ipAddress,
        details: {
          userId: credential.user.id,
          email: credential.user.email,
          credentialId: credential.id,
          storedCounter,
          newCounter,
        },
      })
      return {
        success: false,
        error: 'PassKey authentication failed verification.',
      }
    }

    await prisma.passkeyCredential.update({
      where: { id: credential.id },
      data: {
        counter: BigInt(newCounter),
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
    logError('[PASSKEY] Authentication verification error:', error)

    await logSecurityEvent({
      type: 'PASSKEY_LOGIN_FAILED',
      severity: 'WARNING',
      ipAddress,
      details: {
        usernameless: !sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    })

    return {
      success: false,
      error: 'PassKey authentication failed. Please try again.',
    }
  }
}

/** Get user's registered passkeys */
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

/** SECURITY: Users can only delete their own passkeys unless adminOverride is true */
export async function deletePasskey(
  userId: string,
  credentialId: string,
  adminOverride = false
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

    if (!adminOverride && credential.userId !== userId) {
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

    await logSecurityEvent({
      type: 'PASSKEY_DELETED',
      severity: 'INFO',
      details: {
        userId: credential.userId, // Log the actual owner's userId
        deletedBy: adminOverride ? userId : credential.userId,
        credentialId,
        deviceType: credential.deviceType,
        credentialName: credential.credentialName,
        adminOverride,
      },
    })

    return { success: true }
  } catch (error) {
    logError('[PASSKEY] Delete error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete passkey',
    }
  }
}

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
    logError('[PASSKEY] Update name error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update passkey name',
    }
  }
}
