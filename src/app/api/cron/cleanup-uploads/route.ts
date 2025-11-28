import { NextResponse } from 'next/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}

export async function POST() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}
