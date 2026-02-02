import { NextResponse } from 'next/server'
import { buildLogoSvg, getAccentColor } from '@/lib/brand'

export const runtime = 'nodejs'
export const revalidate = 0

export async function GET() {
  const accent = await getAccentColor()
  const svg = buildLogoSvg(accent, 192)

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=0, s-maxage=0',
    },
  })
}
