import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { logMessage } from '../lib/logging'

// Cameras embed previews as JPEG or as PPM, which sharp cannot read.
const READABLE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('nice', ['-n', '10', command, ...args])
    let stderr = ''

    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', err => reject(new Error(`Failed to spawn ${command}: ${err.message}`)))
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`))
    })
  })
}

// LibRaw writes its output alongside the input and names it after the source
// file, so anything that appeared next to the raw is what it produced.
function outputs(rawPath: string): string[] {
  const dir = path.dirname(rawPath)
  const rawName = path.basename(rawPath)

  return fs.readdirSync(dir)
    .filter(name => name !== rawName)
    .map(name => path.join(dir, name))
}

function discardOutputs(rawPath: string): void {
  for (const file of outputs(rawPath)) {
    fs.rmSync(file, { force: true })
  }
}

function readableOutput(rawPath: string): string | undefined {
  return outputs(rawPath).find(file =>
    READABLE_EXTENSIONS.includes(path.extname(file).toLowerCase()) && fs.statSync(file).size > 0
  )
}

async function longestEdge(filePath: string): Promise<number> {
  const { width, height } = await sharp(filePath).metadata()
  return Math.max(width ?? 0, height ?? 0)
}

/**
 * Decode a camera raw into a file sharp can read, returning its path.
 * Cameras embed a JPEG preview that is usually full size — extracting it costs
 * milliseconds. When that preview is missing, unreadable or too small to render
 * from, LibRaw develops a half-size image instead, which takes seconds.
 */
export async function decodeRawPhoto(rawPath: string, minEdge: number): Promise<string> {
  const rawName = path.basename(rawPath)

  try {
    await run('simple_dcraw', ['-e', rawPath])
    const embedded = readableOutput(rawPath)

    if (embedded && await longestEdge(embedded) >= minEdge) {
      return embedded
    }
    logMessage(`[WORKER] No usable embedded preview in ${rawName}, developing the raw`)
  } catch (error) {
    logMessage(`[WORKER] Embedded preview extraction failed for ${rawName}, developing the raw: ${error}`)
  }

  discardOutputs(rawPath)
  await run('dcraw_emu', ['-w', '-h', '-T', rawPath])

  const developed = readableOutput(rawPath)
  if (!developed) {
    throw new Error(`LibRaw produced no readable output for ${rawName}`)
  }

  return developed
}
