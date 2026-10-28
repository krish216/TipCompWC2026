import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_ROUTES = ['/predict', '/leaderboard', '/tribe', '/admin', '/org-admin', '/settings']
const PUBLIC_ROUTES     = ['/auth']  // auth routes handle their own session
const AUTH_ROUTES      = ['/login']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string)              { return request.cookies.get(name)?.value },
        set(name: string, value: string, opts: any) {
          request.cookies.set({ name, value, ...opts })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...opts })
        },
        remove(name: string, opts: any) {
          request.cookies.set({ name, value: '', ...opts })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...opts })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // Unauthenticated → redirect to login (skip /auth routes — they handle their own flow)
  if (!user && PROTECTED_ROUTES.some(r => pathname.startsWith(r)) && !PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    const url = new URL('/login', request.url)
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Already logged in → send away from login page.
  // Verified users go to /predict; unverified go to homepage (onboarding).
  // email_confirmed_at is Supabase's own native confirmation field — set the moment
  // verifyOtp succeeds (signup code) or an invite-created account is made via the Admin
  // API with email_confirm:true, readable from the JWT without a DB query. Anyone who can
  // reach this check at all already satisfies Supabase's sign-in requirement, so existing
  // accounts (pre-dating this OTP flow, back to the migration-087 backfill) are covered
  // the same way — they wouldn't have a session here otherwise.
  if (user && AUTH_ROUTES.some(r => pathname === r)) {
    const emailVerified = !!(user as any).email_confirmed_at
    const dest = emailVerified ? '/predict' : '/'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // NOTE: Admin check is intentionally NOT done in middleware.
  // Middleware runs on the Edge and cannot reliably access the service role key
  // or make DB queries against admin_users with RLS.
  // The admin page itself handles the check server-side and shows an error UI.

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
