import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Allow unauthenticated access to login routes
  if (request.nextUrl.pathname === '/api/health') return NextResponse.next()
  if (request.nextUrl.pathname === '/api/auth/login') return NextResponse.next()
  if (request.nextUrl.pathname === '/login') return NextResponse.next()

  const key =
    request.headers.get('x-pentest-key') ??
    request.nextUrl.searchParams.get('key') ??
    request.cookies.get('pentest_key')?.value

  if (key !== process.env.PENTEST_KEY) {
    // If it's an API route, return 401
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Otherwise redirect to /login
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
