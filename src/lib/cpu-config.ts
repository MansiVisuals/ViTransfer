import os from 'os'

/**
 * Centralized CPU allocation for video processing
 *
 * Goal: Never max out CPU, leave headroom for system/host processes
 *
 * This module coordinates between:
 * - Worker concurrency (how many jobs run at once)
 * - FFmpeg threads per job
 * - Total CPU budget
 */

export interface CpuAllocation {
  totalThreads: number
  workerConcurrency: number
  threadsPerJob: number
  cleanPreviewConcurrency: number
  maxThreadsUsed: number
}

/**
 * Calculate optimal CPU allocation based on available threads
 *
 * Conservative approach:
 * - Targets ~30-50% thread utilization
 * - Leaves plenty of headroom for system/host processes
 * - Remember: on hyperthreaded CPUs, 12 threads = 6 physical cores
 */
export function getCpuAllocation(): CpuAllocation {
  const totalThreads = os.cpus().length

  // Allow override via environment variable (for Docker resource limits)
  const envThreads = process.env.CPU_THREADS ? parseInt(process.env.CPU_THREADS, 10) : null
  const effectiveThreads = envThreads && envThreads > 0 ? envThreads : totalThreads

  let workerConcurrency: number
  let cleanPreviewConcurrency: number
  let threadsPerJob: number

  // Conservative allocation - keep CPU usage low
  if (effectiveThreads <= 2) {
    // Minimal: 1 job at a time, 1 thread
    workerConcurrency = 1
    cleanPreviewConcurrency = 1
    threadsPerJob = 1
  } else if (effectiveThreads <= 4) {
    // Small (4 threads): 1+1 jobs, 1 thread each = 2 threads (50%)
    workerConcurrency = 1
    cleanPreviewConcurrency = 1
    threadsPerJob = 1
  } else if (effectiveThreads <= 8) {
    // Medium (6-8 threads): 1+1 jobs, 2 threads each = 4 threads (50-67%)
    workerConcurrency = 1
    cleanPreviewConcurrency = 1
    threadsPerJob = 2
  } else if (effectiveThreads <= 16) {
    // Large (12-16 threads): 1+1 jobs, 2 threads each = 4 threads (25-33%)
    workerConcurrency = 1
    cleanPreviewConcurrency = 1
    threadsPerJob = 2
  } else {
    // XL (24+ threads): 2+1 jobs, 2 threads each = 6 threads (~25%)
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

/**
 * Log CPU allocation for debugging
 */
export function logCpuAllocation(allocation: CpuAllocation): void {
  const utilizationPercent = Math.round((allocation.maxThreadsUsed / allocation.totalThreads) * 100)

  console.log(`[CPU CONFIG] Available threads: ${allocation.totalThreads}`)
  console.log(`[CPU CONFIG] Video workers: ${allocation.workerConcurrency}, Clean preview: ${allocation.cleanPreviewConcurrency}`)
  console.log(`[CPU CONFIG] FFmpeg threads per job: ${allocation.threadsPerJob}`)
  console.log(`[CPU CONFIG] Max thread usage: ${allocation.maxThreadsUsed}/${allocation.totalThreads} (~${utilizationPercent}%)`)
}
