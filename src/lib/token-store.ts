let inMemoryAccessToken: string | null = null
let cachedRefreshToken: string | null = null

type TokenChangeListener = (tokens: { accessToken: string | null; refreshToken: string | null }) => void
const listeners = new Set<TokenChangeListener>()

function syncRefreshFromSession(): string | null {
  if (typeof window === 'undefined') return null
  if (cachedRefreshToken) return cachedRefreshToken
  const stored = window.sessionStorage.getItem('vitransfer_refresh_token')
  if (stored) {
    cachedRefreshToken = stored
  }
  return cachedRefreshToken
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken
}

export function getRefreshToken(): string | null {
  return cachedRefreshToken || syncRefreshFromSession()
}

export function setTokens(tokens: { accessToken: string; refreshToken: string }) {
  inMemoryAccessToken = tokens.accessToken
  cachedRefreshToken = tokens.refreshToken

  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem('vitransfer_refresh_token', tokens.refreshToken)
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
    window.sessionStorage.removeItem('vitransfer_refresh_token')
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
