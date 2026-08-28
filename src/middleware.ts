import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ALLOWED = [
  'https://portale-pfc-v3.vercel.app',
  'http://localhost:3000',
]

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') ?? ''
  const allowed = ALLOWED.includes(origin)

  if (req.method === 'OPTIONS' && allowed) {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    })
  }

  if (req.nextUrl.pathname.startsWith('/api/') && allowed) {
    const res = NextResponse.next()
    for (const [k, v] of Object.entries(corsHeaders(origin))) {
      res.headers.set(k, v)
    }
    return res
  }

  return NextResponse.next()
}

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

export const config = {
  matcher: '/api/:path*',
}