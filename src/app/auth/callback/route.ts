import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { sendWelcomeIfNeeded } from '@/lib/welcome-email'

// Handles PKCE code exchange for:
//   - Google / Apple OAuth redirects
//   - Email confirmation links (when emailRedirectTo routes through here)
// After exchanging the code, redirects to ?next= or '/'
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string)                        { return cookieStore.get(name)?.value },
          set(name: string, value: string, opts: any) { try { cookieStore.set({ name, value, ...opts }) } catch {} },
          remove(name: string, opts: any)          { try { cookieStore.set({ name, value: '', ...opts }) } catch {} },
        },
      }
    )
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Fire welcome email for new users (no-op if already sent or email service unconfigured)
      if (sessionData?.user?.id) {
        sendWelcomeIfNeeded(sessionData.user.id).catch(err =>
          console.error('[auth/callback] welcome email error:', err)
        )
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message, '| code:', code.slice(0, 8), '| next:', next)
  } else {
    console.error('[auth/callback] no code param in request:', request.url)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
