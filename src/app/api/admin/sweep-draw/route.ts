import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { sendDrawReminders } from '@/lib/sweep/draw-reminders'

export const dynamic = 'force-dynamic'

// /api/admin/sweep-draw — platform admin only. The "Draw open" switch for a sweep tournament
// (migration 201): while it's off, tickets sell but nobody can spin.
//
// GET  ?tournament_id=  → { draw_open, reminder_sent_at, nudge_sent_at, waiting: { people, tickets } }
//      (waiting = who the "field's in" reminder would reach right now — a dry run, nothing sent)
// POST { tournament_id, open } → flips the switch. Opening it the FIRST time also sends the
//      "spin for your horse" email + notification to every ticket holder; reopening after a
//      close never re-sends (sweep_draw_reminder_sent_at).
async function gate() {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()
  const { data: isAdmin } = await (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { admin }
}

async function loadSweepTournament(admin: any, id: string | null) {
  if (!id) return null
  const { data } = await (admin.from('tournaments') as any)
    .select('id, format, sweep_draw_open, sweep_draw_reminder_sent_at, sweep_draw_nudge_sent_at').eq('id', id).maybeSingle()
  return (data as any)?.format === 'sweep' ? data : null
}

export async function GET(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return g.error
  const t = await loadSweepTournament(g.admin, new URL(req.url).searchParams.get('tournament_id'))
  if (!t) return NextResponse.json({ error: 'Sweep tournament not found' }, { status: 404 })
  return NextResponse.json({
    draw_open: t.sweep_draw_open !== false,
    reminder_sent_at: t.sweep_draw_reminder_sent_at,
    nudge_sent_at: t.sweep_draw_nudge_sent_at,
    waiting: await sendDrawReminders(g.admin, t.id, 'open', { dryRun: true }),
  })
}

export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return g.error
  const body = await req.json().catch(() => null)
  const t = await loadSweepTournament(g.admin, body?.tournament_id ?? null)
  if (!t) return NextResponse.json({ error: 'Sweep tournament not found' }, { status: 404 })
  const open = !!body?.open

  const { error } = await (g.admin.from('tournaments') as any).update({ sweep_draw_open: open }).eq('id', t.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let reminded = null
  if (open && !t.sweep_draw_reminder_sent_at) {
    // Claim the send first so a double-click can't email everyone twice.
    const { data: claimed } = await (g.admin.from('tournaments') as any)
      .update({ sweep_draw_reminder_sent_at: new Date().toISOString() })
      .eq('id', t.id).is('sweep_draw_reminder_sent_at', null).select('id').maybeSingle()
    if (claimed) reminded = await sendDrawReminders(g.admin, t.id, 'open')
  }
  return NextResponse.json({ ok: true, draw_open: open, reminded })
}
