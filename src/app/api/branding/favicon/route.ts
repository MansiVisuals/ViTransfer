import { NextResponse } from 'next/server'
import { isS3Mode, getFilePath } from '@/lib/storage'
import { s3FileExists, s3GetPresignedDownloadUrl } from '@/lib/s3-storage'
import fs from 'fs/promises'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Same paths the upload endpoint writes to. We probe in this order; the first
// one that exists is served. Only one is ever populated at a time because the
// upload endpoint clears the others when writing.
const FORMATS = [
  { path: 'branding/favicon.svg', contentType: 'image/svg+xml' },
  { path: 'branding/favicon.png', contentType: 'image/png' },
  { path: 'branding/favicon.ico', contentType: 'image/x-icon' },
] as const

/**
 * Public favicon endpoint. Browsers request this with no auth — the response
 * is cacheable for 5 minutes so we don't probe storage on every page load.
 */
export async function GET() {
  if (isS3Mode()) {
    for (const format of FORMATS) {
      try {
        const exists = await s3FileExists(format.path)
        if (exists) {
          // 302 to a presigned URL so the browser pulls bytes directly from
          // the object store rather than proxying through Node.
          const url = await s3GetPresignedDownloadUrl(format.path, 3600, undefined, format.contentType)
          return NextResponse.redirect(url, {
            status: 302,
            headers: { 'Cache-Control': 'public, max-age=300, must-revalidate' },
          })
        }
      } catch {
        // Try next format
      }
    }
  } else {
    for (const format of FORMATS) {
      try {
        const data = await fs.readFile(getFilePath(format.path))
        return new NextResponse(data, {
          status: 200,
          headers: {
            'Content-Type': format.contentType,
            'Cache-Control': 'public, max-age=300, must-revalidate',
          },
        })
      } catch {
        // Try next format
      }
    }
  }

  return NextResponse.json({ error: 'Favicon not found' }, { status: 404 })
}
