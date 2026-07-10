import { NextRequest, NextResponse } from 'next/server'
import { getPrimaryTournament } from '@/lib/content/wc'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase'
import { sendWelcomeIfNeeded } from '@/lib/welcome-email'

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
      const admin  = createAdminClient()
      const userId = sessionData.user.id
      await (admin.from('users') as any)
        .update({ email_verified: true })
        .eq('id', userId)

      // Enrol in the active tournament. OAuth (Google/Apple) signups and
      // email-confirmation clicks both land here but were NEVER added to
      // user_tournaments — only the email signup form did it — leaving them off
      // every leaderboard. Idempotent; the welcome email is guarded (sent once,
      // and suppressed for bracket guests).
      try {
        const t = await getPrimaryTournament(admin)
        const tid = (t as any)?.id
        if (tid) {
          await (admin.from('user_tournaments') as any)
            .upsert({ user_id: userId, tournament_id: tid }, { onConflict: 'user_id,tournament_id', ignoreDuplicates: true })
          await sendWelcomeIfNeeded(userId, tid)
        }
      } catch (e: any) {
        console.error('[auth/callback] tournament enrol failed:', e?.message ?? e)
      }

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
