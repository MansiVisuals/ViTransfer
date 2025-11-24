import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*']
}
