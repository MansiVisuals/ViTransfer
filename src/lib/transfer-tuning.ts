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

export const STREAM_HIGH_WATER_MARK_BYTES = parseEnvMb('TRANSFER_STREAM_HWM_MB', 16, 1, 64)
export const STREAM_CHUNK_SIZE_BYTES = parseEnvMb('TRANSFER_STREAM_CHUNK_MB', 4, 1, 64)
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

/**
 * Range parser for **downloads** — does NOT cap open-ended ranges.
 *
 * Browser download managers and CLI tools (curl, wget, axel) typically send
 * `Range: bytes=0-` to start a resumable download. They expect the full file
 * back as one 206 stream, then issue range follow-ups only on disconnect.
 * Capping that to 16 MiB forced N sequential round-trips through Next.js +
 * Prisma per file, killing throughput.
 *
 * - If the client gave an explicit upper bound (`bytes=A-B`), honor it as-is.
 * - If the client gave an open-ended range (`bytes=A-`), return everything from A.
 * - Suffix ranges (`bytes=-N`) return the last N bytes (capped at totalSize).
 */
export function parseDownloadRangeHeader(
  rangeHeader: string,
  totalSize: number
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

    if (rawEnd) {
      end = Number.parseInt(rawEnd, 10)
      if (!Number.isFinite(end) || end < start) return null
      end = Math.min(end, totalSize - 1)
    } else {
      end = totalSize - 1
    }
  } else {
    const suffixLength = Number.parseInt(rawEnd, 10)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null
    start = Math.max(totalSize - suffixLength, 0)
    end = totalSize - 1
  }

  if (end < start) return null
  return { start, end }
}