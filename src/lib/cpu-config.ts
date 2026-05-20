import os from 'os'
import { logMessage } from './logging'

export interface CpuAllocation {
  totalThreads: number
  workerConcurrency: number
  threadsPerJob: number
  cleanPreviewConcurrency: number
  maxThreadsUsed: number
}

/**
 * Calculate optimal CPU allocation.
 * Targets ~30-50% thread utilization to leave headroom for system processes.
 * On hyperthreaded CPUs, 12 threads = 6 physical cores.
 */
export function getCpuAllocation(): CpuAllocation {
  const totalThreads = os.cpus().length

  const envThreads = process.env.CPU_THREADS ? parseInt(process.env.CPU_THREADS, 10) : null
  const effectiveThreads = envThreads && envThreads > 0 ? envThreads : totalThreads

  let workerConcurrency: number
  let cleanPreviewConcurrency: number
  let threadsPerJob: number

  // Conservative allocation
  if (effectiveThreads <= 2) {
    workerConcurrency = 1
    cleanPreviewConcurrency = 1
    threadsPerJob = 1
  } else if (effectiveThreads <= 4) {
    workerConcurrency = 1
    cleanPreviewConcurrency = 1
    threadsPerJob = 1
  } else if (effectiveThreads <= 8) {
    workerConcurrency = 1
    cleanPreviewConcurrency = 1
    threadsPerJob = 2
  } else if (effectiveThreads <= 16) {
    workerConcurrency = 1
    cleanPreviewConcurrency = 1
    threadsPerJob = 2
  } else {
    workerConcurrency = 2
    cleanPreviewConcurrency = 1
    threadsPerJob = 2
  }

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
