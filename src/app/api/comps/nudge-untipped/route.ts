import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { untippedForOpenRound } from '@/lib/untipped'
import { createNotifications } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

const COOLDOWN_MS = 4 * 60 * 60 * 1000   // light rate-limit: one nudge per comp per round / 4h

// POST /api/comps/nudge-untipped { comp_id }
// FREE comp-admin action: send an in-app (bell) tip reminder to members who
// haven't tipped the open round. No email — zero cost, no spam/deliverability risk.
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

  const r = await untippedForOpenRound(admin, comp_id)
  if (!r.round_code) return NextResponse.json({ error: 'No open round to nudge for right now.' }, { status: 409 })
  if (!r.untipped.length) return NextResponse.json({ ok: true, nudged: 0, message: 'Everyone has tipped this round 🎉' })

  // Rate-limit per comp + round (app_settings key holds the last-nudge ISO time).
  const rlKey = `nudge:${comp_id}:${r.round_code}`
  const { data: rl } = await (admin.from('app_settings') as any).select('value').eq('key', rlKey).maybeSingle()
  const last = (rl as any)?.value ? new Date((rl as any).value).getTime() : 0
  const since = Date.now() - last
  if (last && since < COOLDOWN_MS) {
    const mins = Math.ceil((COOLDOWN_MS - since) / 60000)
    return NextResponse.json({ error: `Already nudged recently — try again in ${mins >= 60 ? `${Math.ceil(mins / 60)}h` : `${mins}m`}.` }, { status: 429 })
  }

  await createNotifications(r.untipped.map(m => ({
    user_id: m.user_id,
    type:    'round_deadline' as const,
    title:   `⏰ Get your ${r.round_name} tips in!`,
    body:    `Your ${r.round_name} tips are still missing — tap to lock them in before kick-off.`,
    data:    { href: '/predict' },
  })))

  await (admin.from('app_settings') as any).upsert({ key: rlKey, value: new Date().toISOString(), updated_at: new Date().toISOString() })

  return NextResponse.json({ ok: true, nudged: r.untipped.length, round_name: r.round_name })
}
