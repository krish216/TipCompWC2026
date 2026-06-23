import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { noBonusTeamForComp } from '@/lib/no-bonus-team'
import { createNotifications } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

const COOLDOWN_MS = 4 * 60 * 60 * 1000   // light rate-limit: one nudge per comp / 4h

// POST /api/comps/nudge-no-bonus { comp_id }
// FREE comp-admin action: send an in-app (bell) reminder to members who haven't
// picked a Bonus Team yet. No email — zero cost, no deliverability risk.
export async function POST(request: NextRequest) {
  const admin = createAdminClient()
  const user  = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id } = await request.json().catch(() => ({}))
  if (!comp_id) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  // Authorise: comp admin of this comp OR global admin.
  const [{ data: ca }, { data: ga }] = await Promise.all([
    (admin.from('comp_admins') as any).select('comp_id').eq('user_id', user.id).eq('comp_id', comp_id).maybeSingle(),
    (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  if (!ca && !ga) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const r = await noBonusTeamForComp(admin, comp_id)
  if (r.locked) return NextResponse.json({ error: 'Bonus Team picks are closed for this tournament.' }, { status: 409 })
  if (!r.missing.length) return NextResponse.json({ ok: true, nudged: 0, message: 'Everyone has picked a Bonus Team 🎉' })

  // Rate-limit per comp (app_settings key holds the last-nudge ISO time).
  const rlKey = `nudge-bonus:${comp_id}`
  const { data: rl } = await (admin.from('app_settings') as any).select('value').eq('key', rlKey).maybeSingle()
  const last = (rl as any)?.value ? new Date((rl as any).value).getTime() : 0
  const since = Date.now() - last
  if (last && since < COOLDOWN_MS) {
    const mins = Math.ceil((COOLDOWN_MS - since) / 60000)
    return NextResponse.json({ error: `Already nudged recently — try again in ${mins >= 60 ? `${Math.ceil(mins / 60)}h` : `${mins}m`}.` }, { status: 429 })
  }

  await createNotifications(r.missing.map(m => ({
    user_id: m.user_id,
    type:    'round_deadline' as const,
    title:   '⭐ Pick your Bonus Team!',
    body:    'You haven\'t set a Bonus Team yet — it scores 2× on Group Stage 3 + the Round of 32. Tap to lock yours in before it closes.',
    data:    { href: '/predict' },
  })))

  await (admin.from('app_settings') as any).upsert({ key: rlKey, value: new Date().toISOString(), updated_at: new Date().toISOString() })

  return NextResponse.json({ ok: true, nudged: r.missing.length })
}
