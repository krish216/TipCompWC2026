import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase'

// Handles PKCE code exchange for:
//   - Google / Apple OAuth redirects
//   - Magic link clicks (email verification from welcome email)
// Every successful code exchange proves the user owns their email address,
// so we mark email_verified=true for all cases.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Magic-link verification has no ?next= — send them to the confirmed page.
  // OAuth flows always set ?next= explicitly, so the default is only hit by verification clicks.
  const next = searchParams.get('next') ?? '/auth/confirmed'

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
    if (!error && sessionData?.user?.id) {
      const admin = createAdminClient()
      await (admin.from('users') as any)
        .update({ email_verified: true })
        .eq('id', sessionData.user.id)
      return NextResponse.redirect(`${origin}${next}`)
    }
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession failed:', error.message, '| code:', code.slice(0, 8), '| next:', next)
    }
  } else {
    console.error('[auth/callback] no code param in request:', request.url)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
