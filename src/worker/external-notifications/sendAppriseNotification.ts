import { spawn } from 'child_process'
import path from 'path'

export type AppriseNotifyType = 'info' | 'success' | 'warning' | 'failure'

export interface AppriseNotificationRequest {
  urls: string[]
  title: string
  body: string
  notifyType?: AppriseNotifyType
  timeoutMs?: number
}

export interface AppriseNotificationResult {
  success: boolean
  destinations?: number
  error?: string
  stderr?: string
}

export async function sendAppriseNotification(
  request: AppriseNotificationRequest
): Promise<AppriseNotificationResult> {
  const runnerPath = path.join(process.cwd(), 'src/worker/external-notifications/apprise-runner.py')
  const pythonBin = process.env.APPRISE_PYTHON || 'python3'
  const timeoutMs = request.timeoutMs ?? 10_000

  return new Promise((resolve) => {
    const child = spawn(pythonBin, [runnerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let exited = false

    const timeout = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
      exited = true
      resolve({
        success: false,
        error: `Apprise timed out after ${timeoutMs}ms`,
        stderr,
      })
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })

    child.on('close', (code) => {
      clearTimeout(timeout)
      if (exited) return
      const trimmed = stdout.trim()
      if (!trimmed) {
        resolve({
          success: false,
          error: `Apprise runner produced no output (exit=${code ?? 'unknown'})`,
          stderr: stderr.trim() || undefined,
        })
        return
      }

      try {
        const parsed = JSON.parse(trimmed) as AppriseNotificationResult
        resolve({
          ...parsed,
          stderr: stderr.trim() || undefined,
        })
      } catch {
        resolve({
          success: false,
          error: `Failed to parse Apprise runner output (exit=${code ?? 'unknown'})`,
          stderr: `${stderr.trim()}\n${trimmed}`.trim(),
        })
      }
    })

    child.stdin.write(
      JSON.stringify({
        urls: request.urls,
        title: request.title,
        body: request.body,
        notifyType: request.notifyType ?? 'info',
      })
    )
    child.stdin.end()
  })
}
