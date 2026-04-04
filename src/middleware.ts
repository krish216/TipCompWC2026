import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_ROUTES = ['/predict', '/leaderboard', '/tribe', '/admin', '/settings']
const AUTH_ROUTES      = ['/login']
const ADMIN_ROUTES     = ['/admin']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  // Regular user-role client for session refresh
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name)              { return request.cookies.get(name)?.value },
        set(name, value, opts) {
          request.cookies.set({ name, value, ...opts })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...opts })
        },
        remove(name, opts) {
          request.cookies.set({ name, value: '', ...opts })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...opts })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // Unauthenticated → redirect to login
  if (!user && PROTECTED_ROUTES.some(r => pathname.startsWith(r))) {
    const url = new URL('/login', request.url)
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Already logged in → send away from login page
  if (user && AUTH_ROUTES.some(r => pathname === r)) {
    return NextResponse.redirect(new URL('/predict', request.url))
  }

  // Admin routes — use service-role client to bypass RLS on admin_users
  if (user && ADMIN_ROUTES.some(r => pathname.startsWith(r))) {
    const serviceClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,  // service role bypasses RLS
      {
        cookies: {
          get(name)              { return request.cookies.get(name)?.value },
          set(name, value, opts) { response.cookies.set({ name, value, ...opts }) },
          remove(name, opts)     { response.cookies.set({ name, value: '', ...opts }) },
        },
      }
    )

    const { data: adminRow } = await serviceClient
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .single()

    if (!adminRow) {
      return NextResponse.redirect(new URL('/?error=not-admin', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}