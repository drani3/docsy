import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PREFIXES = ['/dashboard', '/documents', '/conversations', '/settings']

export async function middleware(req: NextRequest) {
  // Request id for tracing: every log line of this request carries it
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID()
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-request-id', requestId)

  const { pathname } = req.nextUrl

  // API routes authenticate themselves (and must see the raw body, e.g. the
  // Stripe webhook); here they only get the request id
  if (pathname.startsWith('/api/')) {
    const res = NextResponse.next({ request: { headers: requestHeaders } })
    res.headers.set('x-request-id', requestId)
    return res
  }

  let res = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Refreshed tokens go both to the page being rendered and back to the browser
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    }
  )

  // getUser() validates the token with Supabase and refreshes an expired
  // session; getSession() would trust whatever the cookie says
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && PROTECTED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    const login = new URL('/login', req.url)
    login.searchParams.set('next', pathname + req.nextUrl.search)
    return NextResponse.redirect(login)
  }

  // Signed-in users skip the login and signup pages
  if (user && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  res.headers.set('x-request-id', requestId)
  return res
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/documents/:path*',
    '/conversations/:path*',
    '/settings/:path*',
    '/login',
    '/signup',
    '/api/:path*',
  ],
}
