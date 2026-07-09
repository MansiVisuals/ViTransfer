import os from 'os'
import { logMessage } from './logging'

export interface CpuAllocation {
  totalThreads: number
  workerConcurrency: number
  threadsPerJob: number
  cleanPreviewConcurrency: number
  maxThreadsUsed: number
}

function parseEnvInt(name: string, max: number): number | null {
  const parsed = parseInt(process.env[name] ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return null
  return Math.min(parsed, max)
}

/**
 * Budget-based CPU allocation: worst case (all video workers + clean preview
 * encoding at once) stays at or under half the host, on any host size.
 * WORKER_CONCURRENCY and FFMPEG_THREADS_PER_JOB override the computed values.
 */
export function getCpuAllocation(): CpuAllocation {
  const effectiveThreads = parseEnvInt('CPU_THREADS', 256) ?? os.cpus().length

  const budget = Math.max(1, Math.floor(effectiveThreads / 2))
  const cleanPreviewConcurrency = 1
  const workerConcurrency = parseEnvInt('WORKER_CONCURRENCY', 16)
    ?? (effectiveThreads >= 24 ? 2 : 1)
  // Cap at 8: x264 thread scaling flattens beyond that
  const threadsPerJob = parseEnvInt('FFMPEG_THREADS_PER_JOB', 64)
    ?? Math.min(8, Math.max(1, Math.floor(budget / (workerConcurrency + cleanPreviewConcurrency))))

  const maxThreadsUsed = (workerConcurrency + cleanPreviewConcurrency) * threadsPerJob

  return {
    totalThreads: effectiveThreads,
    workerConcurrency,
    threadsPerJob,
    cleanPreviewConcurrency,
    maxThreadsUsed,
  }
}

/** Log CPU allocation for debugging */
export function logCpuAllocation(allocation: CpuAllocation): void {
  const utilizationPercent = Math.round((allocation.maxThreadsUsed / allocation.totalThreads) * 100)

  logMessage(`[CPU CONFIG] Available threads: ${allocation.totalThreads}`)
  logMessage(`[CPU CONFIG] Video workers: ${allocation.workerConcurrency}, Clean preview: ${allocation.cleanPreviewConcurrency}`)
  logMessage(`[CPU CONFIG] FFmpeg threads per job: ${allocation.threadsPerJob}`)
  logMessage(`[CPU CONFIG] Max thread usage: ${allocation.maxThreadsUsed}/${allocation.totalThreads} (~${utilizationPercent}%)`)
}
