const MB = 1024 * 1024

type RangeTuple = { start: number; end: number }

function parseEnvMb(name: string, fallbackMb: number, minMb: number, maxMb: number): number {
  const raw = process.env[name]
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return fallbackMb * MB
  }
  const bounded = Math.min(Math.max(parsed, minMb), maxMb)
  return Math.floor(bounded) * MB
}

export const STREAM_HIGH_WATER_MARK_BYTES = parseEnvMb('TRANSFER_STREAM_HWM_MB', 4, 1, 32)
export const STREAM_CHUNK_SIZE_BYTES = parseEnvMb('TRANSFER_STREAM_CHUNK_MB', 4, 1, 64)
export const DOWNLOAD_CHUNK_SIZE_BYTES = parseEnvMb('TRANSFER_DOWNLOAD_CHUNK_MB', 16, 4, 128)
export const TUS_RETRY_DELAYS_MS = [0, 1000, 3000, 5000, 10000]

function getEffectiveNetworkType(): string | undefined {
  if (typeof navigator === 'undefined') return undefined
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string }
  }
  return nav.connection?.effectiveType
}

export function getTusChunkSizeBytes(fileSize: number): number {
  const effectiveType = getEffectiveNetworkType()

  // On slow connections keep chunks small so a stalled part doesn't block for too long
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return 2 * MB
  if (effectiveType === '3g') return 8 * MB

  // Scale with file size, capped at 25 MiB to stay well under Cloudflare's 100 MiB limit
  if (fileSize >= 100 * MB) return 25 * MB
  return 10 * MB
}

export function parseBoundedRangeHeader(
  rangeHeader: string,
  totalSize: number,
  maxChunkSize: number
): RangeTuple | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!match) return null

  const rawStart = match[1]
  const rawEnd = match[2]

  if (!rawStart && !rawEnd) return null

  let start: number
  let end: number

  if (rawStart) {
    start = Number.parseInt(rawStart, 10)
    if (!Number.isFinite(start) || start < 0 || start >= totalSize) return null

    const requestedEnd = rawEnd ? Number.parseInt(rawEnd, 10) : start + maxChunkSize - 1
    if (!Number.isFinite(requestedEnd) || requestedEnd < start) return null

    end = Math.min(requestedEnd, start + maxChunkSize - 1, totalSize - 1)
  } else {
    const suffixLength = Number.parseInt(rawEnd, 10)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null

    const boundedSuffix = Math.min(suffixLength, maxChunkSize, totalSize)
    start = Math.max(totalSize - boundedSuffix, 0)
    end = totalSize - 1
  }

  if (end < start) return null
  return { start, end }
}