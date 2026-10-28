import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { getPrimaryTournament } from '@/lib/content/wc'
import { sendWelcomeIfNeeded } from '@/lib/welcome-email'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// POST /api/auth/verify-signup — called once, right after the client's
// supabase.auth.verifyOtp({type:'signup'}) succeeds (which already establishes the
// session this route reads). Replicates what /auth/callback used to do for the
// link-click path: mark the DB verified flag (HomeClient.tsx also self-heals this from
// email_confirmed_at, but set it directly rather than rely on that happening first) and
// send the welcome email — the one thing with no other trigger on this path, since
// tournament enrolment already happened synchronously at signUp() time regardless of
// confirmation state.
export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  await (admin.from('users') as any).update({ email_verified: true }).eq('id', user.id)

  try {
    const t = await getPrimaryTournament(admin)
    const tid = (t as any)?.id
    if (tid) await sendWelcomeIfNeeded(user.id, tid)
  } catch (e: any) {
    console.error('[verify-signup] welcome email failed:', e?.message ?? e)
  }

  return NextResponse.json({ ok: true })
}
