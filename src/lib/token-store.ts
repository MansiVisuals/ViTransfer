let inMemoryAccessToken: string | null = null
let cachedRefreshToken: string | null = null

type TokenChangeListener = (tokens: { accessToken: string | null; refreshToken: string | null }) => void
const listeners = new Set<TokenChangeListener>()

// Use localStorage for PWA persistence (survives app close on iOS)
// sessionStorage would be cleared when iOS closes the PWA
const STORAGE_KEY = 'vitransfer_refresh_token'

function syncRefreshFromStorage(): string | null {
  if (typeof window === 'undefined') return null
  if (cachedRefreshToken) return cachedRefreshToken
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored) {
    cachedRefreshToken = stored
  }
  return cachedRefreshToken
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken
}

export function getRefreshToken(): string | null {
  return cachedRefreshToken || syncRefreshFromStorage()
}

export function setTokens(tokens: { accessToken: string; refreshToken: string }) {
  inMemoryAccessToken = tokens.accessToken
  cachedRefreshToken = tokens.refreshToken

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, tokens.refreshToken)
  }

  notifyListeners()
}

export function updateAccessToken(accessToken: string) {
  inMemoryAccessToken = accessToken
  notifyListeners()
}

export function clearTokens() {
  inMemoryAccessToken = null
  cachedRefreshToken = null

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY)
  }

  notifyListeners()
}

export function subscribe(listener: TokenChangeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notifyListeners() {
  const snapshot = { accessToken: inMemoryAccessToken, refreshToken: cachedRefreshToken }
  listeners.forEach(fn => fn(snapshot))
}
