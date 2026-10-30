import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { sendWelcomeIfNeeded } from '@/lib/welcome-email'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// POST /api/auth/verify-signup — called once, right after the client's
// supabase.auth.verifyOtp({type:'signup'}) succeeds (which already establishes the
// session this route reads). Replicates what /auth/callback used to do for the
// link-click path: mark the DB verified flag (HomeClient.tsx also self-heals this from
// email_confirmed_at, but set it directly rather than rely on that happening first) and
// send each enrolled tournament's welcome (lib/welcome-email.ts — idempotent, and only for
// tournaments with a welcome written). Enrolment already happened at signUp() time, into the
// tournament they signed up for — a sweep sign-up isn't in the football tournament at all,
// so it gets no football welcome.
export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  await (admin.from('users') as any).update({ email_verified: true }).eq('id', user.id)

  try {
    const { data: enrolments } = await (admin.from('user_tournaments') as any)
      .select('tournament_id').eq('user_id', user.id)
    for (const e of (enrolments ?? []) as any[]) await sendWelcomeIfNeeded(user.id, e.tournament_id)
  } catch (e: any) {
    console.error('[verify-signup] welcome email failed:', e?.message ?? e)
  }

  return NextResponse.json({ ok: true })
}
