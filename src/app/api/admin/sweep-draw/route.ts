import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { sendDrawReminders } from '@/lib/sweep/draw-reminders'
import { drawPendingAutoDraws } from '@/lib/sweep/draw'
import { VOICE_PARTS, voicesFor } from '@/lib/sweep/voices'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// /api/admin/sweep-draw — platform admin only. The "Draw open" switch for a sweep tournament
// (migration 201): while it's off, tickets sell but nobody can spin.
//
// GET  ?tournament_id=  → { draw_open, voices, voice_parts, reminder_sent_at, nudge_sent_at, waiting: { people, tickets } }
//      (waiting = who the "field's in" reminder would reach right now — a dry run, nothing sent)
// POST { tournament_id, open } → flips the switch. Opening it the FIRST time also sends the
//      "spin for your horse" email + notification to every ticket holder; reopening after a
//      close never re-sends (sweep_draw_reminder_sent_at).
// POST { tournament_id, voices } → Vicky & Gordo on/off for the tournament (migration 210).
// POST { tournament_id, voice_part, on } → one part on/off under it (migration 211).
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
  // '*' so the draw switch keeps working before migration 210 adds sweep_voices.
  const { data } = await (admin.from('tournaments') as any).select('*').eq('id', id).maybeSingle()
  return (data as any)?.format === 'sweep' ? data : null
}

export async function GET(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return g.error
  const t = await loadSweepTournament(g.admin, new URL(req.url).searchParams.get('tournament_id'))
  if (!t) return NextResponse.json({ error: 'Sweep tournament not found' }, { status: 404 })
  return NextResponse.json({
    draw_open: t.sweep_draw_open !== false,
    voices: t.sweep_voices !== false,   // the master switch
    voice_parts: voicesFor({ sweep_voice_parts: t.sweep_voice_parts }),   // each part, ignoring the master
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

  if (typeof body?.voices === 'boolean') {
    const { error } = await (g.admin.from('tournaments') as any).update({ sweep_voices: body.voices }).eq('id', t.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, voices: body.voices })
  }
  if (typeof body?.voice_part === 'string' && typeof body?.on === 'boolean') {
    if (!VOICE_PARTS.some(p => p.key === body.voice_part)) return NextResponse.json({ error: 'Unknown voice part' }, { status: 400 })
    const parts = { ...((t as any).sweep_voice_parts ?? {}), [body.voice_part]: body.on }
    const { error } = await (g.admin.from('tournaments') as any).update({ sweep_voice_parts: parts }).eq('id', t.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, voice_parts: voicesFor({ sweep_voice_parts: parts }) })
  }

  const open = !!body?.open

  const { error } = await (g.admin.from('tournaments') as any).update({ sweep_draw_open: open }).eq('id', t.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The first opening starts everyone's 2 hours to spin (migration 205, lib/sweep/grace.ts).
  // Re-opening after a close keeps the original time. Ignored before the migration has run.
  if (open) {
    await (g.admin.from('tournaments') as any)
      .update({ sweep_draw_opened_at: new Date().toISOString() })
      .eq('id', t.id).is('sweep_draw_opened_at', null)
  }

  // Buyers who asked for auto-draw (migration 203) and were approved while the draw was
  // closed get their horses now, before the "spin now" reminder goes out.
  const autoDrawn = open ? await drawPendingAutoDraws(g.admin, t.id) : 0

  let reminded = null
  if (open && !t.sweep_draw_reminder_sent_at) {
    // Claim the send first so a double-click can't email everyone twice.
    const { data: claimed } = await (g.admin.from('tournaments') as any)
      .update({ sweep_draw_reminder_sent_at: new Date().toISOString() })
      .eq('id', t.id).is('sweep_draw_reminder_sent_at', null).select('id').maybeSingle()
    if (claimed) reminded = await sendDrawReminders(g.admin, t.id, 'open')
  }
  return NextResponse.json({ ok: true, draw_open: open, auto_drawn: autoDrawn, reminded })
}
