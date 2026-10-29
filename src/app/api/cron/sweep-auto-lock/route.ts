import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { sendDrawReminders } from '@/lib/sweep/draw-reminders'

export const dynamic = 'force-dynamic'

const NUDGE_BEFORE_MS = 6 * 60 * 60 * 1000   // 9am AEDT for a 3pm jump

// Locks every sweep tribe whose tournament's race_start_at is within 30 minutes, so "no more
// new picks/joins/requests" actually takes effect ahead of the jump even if the organiser
// never clicks the manual lock toggle. Reuses sweep_locked_at — there's no need for the UI to
// distinguish an auto-lock from a manual one, both just mean "locked". CRON_SECRET-authed,
// scheduled via Supabase pg_cron — see supabase/saved-migrations/sweep-auto-lock-pg_cron.sql.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Race-morning nudge (migration 201): once, ~6 hours before the jump, remind everyone still
  // holding unspun tickets. Claimed via sweep_draw_nudge_sent_at so overlapping runs can't
  // double-send; only for races whose draw is open (nothing to spin otherwise).
  let nudged: { people: number; tickets: number } | null = null
  const { data: nudgeDue } = await (admin.from('tournaments') as any)
    .select('id').eq('format', 'sweep').eq('sweep_draw_open', true).is('sweep_draw_nudge_sent_at', null)
    .not('race_start_at', 'is', null)
    .gt('race_start_at', new Date(Date.now() + 30 * 60 * 1000).toISOString())
    .lte('race_start_at', new Date(Date.now() + NUDGE_BEFORE_MS).toISOString())
  for (const t of (nudgeDue ?? []) as any[]) {
    const { data: claimed } = await (admin.from('tournaments') as any)
      .update({ sweep_draw_nudge_sent_at: new Date().toISOString() })
      .eq('id', t.id).is('sweep_draw_nudge_sent_at', null).select('id').maybeSingle()
    if (claimed) nudged = await sendDrawReminders(admin, t.id, 'nudge')
  }

  const { data: tourns } = await (admin.from('tournaments') as any)
    .select('id')
    .eq('format', 'sweep')
    .not('race_start_at', 'is', null)
    .lte('race_start_at', new Date(Date.now() + 30 * 60 * 1000).toISOString())
  const tournIds = ((tourns ?? []) as any[]).map(t => t.id)
  if (!tournIds.length) return NextResponse.json({ locked: 0, nudged, reason: 'no tournament within 30 minutes of race_start_at' })

  const { data: locked, error } = await (admin.from('tribes') as any)
    .update({ sweep_locked_at: new Date().toISOString() })
    .in('tournament_id', tournIds)
    .is('sweep_locked_at', null)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ locked: (locked ?? []).length, nudged })
}
