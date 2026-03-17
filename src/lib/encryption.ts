import { logError, logWarn } from './logging'

const isEdgeRuntime = typeof process !== 'undefined' && process.env.NEXT_RUNTIME === 'edge'

// Lazy-load crypto so the module isn't pulled into Edge bundles.
let cryptoModule: typeof import('crypto') | null = null

function getCrypto(): typeof import('crypto') {
  if (cryptoModule) return cryptoModule

  if (isEdgeRuntime) {
    throw new Error('Encryption utilities require the Node.js runtime. Set runtime = \"nodejs\" for routes that use them.')
  }

  // Safe to require because all callers run on the server (Node.js)
   
  cryptoModule = require('crypto') as typeof import('crypto')
  return cryptoModule
}

// Encryption key REQUIRED in production (see README for setup instructions)
// Skip validation during build or if explicitly disabled
const skipValidation = process.env.SKIP_ENV_VALIDATION === '1'

if (!skipValidation && !process.env.ENCRYPTION_KEY) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY must be set in production. See README for setup instructions.')
  } else {
    logWarn('WARNING: Using insecure ENCRYPTION_KEY for DEVELOPMENT only. See README for production setup.')
  }
}

// Get encryption key from environment or use insecure default for dev
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'DEV_ONLY_INSECURE_KEY_32BYTES!'
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

/**
 * Validate that encryption key is configured properly (runtime check)
 */
function validateEncryptionKey(): void {
  // Skip validation during build or if explicitly disabled
  if (process.env.SKIP_ENV_VALIDATION === '1') {
    return
  }
  
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ENCRYPTION_KEY) {
      throw new Error('ENCRYPTION_KEY must be set in production. See README for setup instructions.')
    }
    if (process.env.ENCRYPTION_KEY === 'DEV_ONLY_INSECURE_KEY_32BYTES!') {
      throw new Error('Production ENCRYPTION_KEY must not use default development value. Generate a secure key using: openssl rand -base64 32')
    }
  }
}

/**
 * Derive encryption key using scrypt (Key Derivation Function)
 * This is more secure than simple padding as it:
 * 1. Creates a consistent 32-byte key from any input length
 * 2. Uses a deterministic salt for consistent key generation
 * 3. Applies computational hardening (though minimal for performance)
 */
function getEncryptionKey(): Buffer {
  const crypto = getCrypto()

  // Use a fixed salt for deterministic key derivation
  // This ensures the same ENCRYPTION_KEY always produces the same derived key
  const salt = 'vitransfer-encryption-v1'

  // Use scrypt with minimal cost for fast key derivation
  // N=1024, r=8, p=1 provides good security with minimal performance impact
  return crypto.scryptSync(ENCRYPTION_KEY, salt, 32, {
    N: 1024,  // CPU/memory cost (lower = faster, still secure for deterministic derivation)
    r: 8,     // Block size
    p: 1      // Parallelization
  })
}

/**
 * Encrypt sensitive data
 * @param text Plain text to encrypt
 * @returns Encrypted string in format: iv:authTag:encryptedData (hex)
 */
export function encrypt(text: string): string {
  if (!text) return ''
  
  validateEncryptionKey()
  
  try {
    const crypto = getCrypto()
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag()
    
    // Return format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
  } catch (error) {
    logError('Encryption error:', error)
    throw new Error('Failed to encrypt data')
  }
}

/**
 * Decrypt sensitive data
 * @param encryptedText Encrypted string in format: iv:authTag:encryptedData
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return ''
  
  validateEncryptionKey()
  
  try {
    const crypto = getCrypto()
    const key = getEncryptionKey()
    const parts = encryptedText.split(':')
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format')
    }
    
    const iv = Buffer.from(parts[0], 'hex')
    const authTag = Buffer.from(parts[1], 'hex')
    const encrypted = parts[2]
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  } catch (error) {
    logError('Decryption error:', error)
    throw new Error('Failed to decrypt data')
  }
}

/**
 * Hash a password using bcrypt
 * @param password Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = require('bcryptjs')
  const salt = await bcrypt.genSalt(14)
  return bcrypt.hash(password, salt)
}

/**
 * Verify a password against a hash
 * @param password Plain text password
 * @param hash Hashed password
 * @returns True if password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = require('bcryptjs')
  return bcrypt.compare(password, hash)
}

/**
 * Validate password strength
 * @param password Password to validate
 * @returns Object with isValid, errors, and strength
 */
export function validatePassword(password: string): { 
  isValid: boolean
  errors: string[]
  strength: 'weak' | 'medium' | 'strong'
} {
  const errors: string[] = []
  
  // Length check (increased from 8 to 12)
  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long')
  }
  
  // Character requirements
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }
  
  // Require special character
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*)')
  }
  
  // Check against common passwords (NordPass Top 200 — 2025)
  const commonPasswords = [
    '123456', 'admin', '12345678', '123456789', '12345',
    'password', 'aa123456', '1234567890', 'pass@123', 'admin123',
    '1234567', '123123', '111111', '12345678910', 'p@ssw0rd',
    'aa@123456', 'admintelecom', 'admin@123', '112233', '102030',
    '654321', 'abcd1234', 'abc123', 'qwerty123', 'abcd@1234',
    'pass@1234', '11223344', 'admin@123', '87654321', '987654321',
    'qwerty', '123123123', '1q2w3e4r', 'aa112233', '12341234',
    'qwertyuiop', '11111111', 'password@123', 'asd123', 'aboy1234',
    '123321', 'admin1', 'demo@123', '1q2w3e4r5t', 'admin1234',
    '121212', 'asdf1234', '888888', 'abcd1234', '123456789',
    'guru123456', '666666', 'welcome@123', 'guest', 'password1',
    '123456789a', 'kapler123', 'administrator', '1122334455', 'test@123',
    'qwer1234', 'asdfghjkl', 'global123@', '10203040', '1234qwer',
    'india@123', 'abcd@123', '1qaz2wsx', '88888888', '123qwe',
    '12345678a', 'secret', 'aa123123', '12344321', '123456aa@',
    '123456a', 'a123456', '202020', '1234abcd', 'admin123456',
    'qwe123', '101010', '222222', '12121212', 'welcome',
    'abc12345', 'abc@1234', 'admin12345', 'qwerty123', '12345678900',
    '123654', '555555', 'aa123456789', '1111111111', '12345678901',
    'q1w2e3r4', 'password123', 'heslo1234', '22446688', 'abc12345',
    'vodafone', '999999', 'bismillah', 'a123456789', 'password123',
    'azerty', 'user1234', '1234567891', '1234512345', 'adminisp',
    '1234567899', 'p@$$w0rd', 'aa12345678', 'passw0rd', 'zxcvbnm',
    'adminadmin', 'qwerty12345', 'gvt12345', 'minecraft', 'abcd@1234',
    'pakistan', '10203', 'welcome1', 'theworldinyourhand', 'aabb1122',
    'test123', 'asdf1234', '54321', '1111111', 'a1b2c3d4',
    'student', 'abc@12345', 'aa102030', 'pass@12345',
    '135790', '123abc', 'cisco', '11111', 'aa@12345',
    '111111111', 'p@ssw0rd', 'lol123456', '147258369', '123456aa',
    'aa@1234567', 'admin@1234', '1234554321', '124578', '12qwaszx',
    'abc@123', 'a12345678', 'aa112233', 'qwer4321', 'a1234567',
    'qwerty@123', '12345679', 'ab123456', 'aa@123456789', 'abcd1234@',
    '123qweasd', 'admin1234', 'pakistan123', 'a123456a', 'qwerty1234',
    '1234567a', 'abc123456', 'turktelekom', 'test1234', '999999999',
    '123456788', 'aaa111', 'contraseña', '7654321', '1qazxsw2',
    'password@1', 'asdasd', 'aaaaaa', 'qwerty123456', '246810',
    '11112222', 'aaaa1111', 'abc123', 'q1w2e3r4t5', '987654',
    'aa123123', 'azerty123', 'aa1234567', 'abc@123', 'changeme',
    '12345678@', 'p@55w0rd', 'asd12345', 'zxcvbnm123', '123admin',
  ]
  
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common. Please choose a stronger password')
  }
  
  // Check for repeated characters (e.g., "aaaa")
  if (/(.)\1{3,}/.test(password)) {
    errors.push('Password contains too many repeated characters')
  }
  
  // Check for sequential characters (e.g., "1234", "abcd")
  const sequences = ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm']
  const lowerPassword = password.toLowerCase()
  for (const seq of sequences) {
    for (let i = 0; i <= seq.length - 4; i++) {
      const subseq = seq.substring(i, i + 4)
      if (lowerPassword.includes(subseq) || lowerPassword.includes(subseq.split('').reverse().join(''))) {
        errors.push('Password contains sequential characters')
        break
      }
    }
  }
  
  // Calculate strength
  let strength: 'weak' | 'medium' | 'strong' = 'weak'
  if (errors.length === 0) {
    if (password.length >= 16 && /[^A-Za-z0-9].*[^A-Za-z0-9]/.test(password)) {
      strength = 'strong' // 16+ chars with multiple special chars
    } else if (password.length >= 12) {
      strength = 'medium'
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    strength,
  }
}
