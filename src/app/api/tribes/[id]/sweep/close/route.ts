import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { DRAW_OPENS_LABEL, loadField } from '@/lib/sweep/field'
import { drawUnspunTickets } from '@/lib/sweep/draw'

export const dynamic = 'force-dynamic'

// POST /api/tribes/:id/sweep/close — comp-admin only. Distinct from sweep/lock: lock only
// ever meant "stop new joins" (migration 190) and isn't re-runnable; close is the explicit
// "finalize this draw" action — it locks if not already locked, draws a horse for every
// ticket its holder never spun (lib/sweep/draw.ts), and then, if the comp has
// opted into sweep_leftover_mode='auto_assign_organiser', hands every still-unclaimed,
// unscratched horse straight to the organiser (no ticket-then-claim step needed — there's
// no contention over who gets a horse nobody bought).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const tribeId = params.id

  const { data: tribe } = await (admin.from('tribes') as any)
    .select('id, comp_id, tournament_id, sweep_locked_at').eq('id', tribeId).maybeSingle()
  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })

  const { data: tourn } = await (admin.from('tournaments') as any)
    .select('format').eq('id', tribe.tournament_id).maybeSingle()
  if ((tourn as any)?.format !== 'sweep') {
    return NextResponse.json({ error: 'This tribe is not a sweep' }, { status: 400 })
  }

  const { data: isAdmin } = await (admin.from('comp_admins') as any)
    .select('user_id').eq('comp_id', tribe.comp_id).eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return NextResponse.json({ error: 'Only a comp admin can close this pool' }, { status: 403 })

  // Finalising hands out leftover horses — meaningless before the real field is loaded.
  if (!(await loadField(admin, tribe.tournament_id)).drawOpen) {
    return NextResponse.json({ error: `You can close the pool once the draw opens (${DRAW_OPENS_LABEL}). To stop new joins now, lock it instead.` }, { status: 409 })
  }

  if (!tribe.sweep_locked_at) {
    await (admin.from('tribes') as any)
      .update({ sweep_locked_at: new Date().toISOString() }).eq('id', tribeId).is('sweep_locked_at', null)
  }

  // Paid-but-unspun tickets get their horse FIRST — otherwise the leftover hand-out below
  // would give the organiser the horses those ticket holders paid to draw.
  const { drawn: unspunDrawn } = await drawUnspunTickets(admin, { tribeId, tournamentId: tribe.tournament_id })

  const { data: comp } = await (admin.from('comps') as any)
    .select('sweep_leftover_mode').eq('id', tribe.comp_id).maybeSingle()

  let leftoverHorsesAssigned = 0
  if ((comp as any)?.sweep_leftover_mode === 'auto_assign_organiser') {
    const [{ data: horses }, { data: entries }] = await Promise.all([
      (admin.from('sweep_horses') as any)
        .select('id').eq('tournament_id', tribe.tournament_id).eq('scratched', false),
      (admin.from('sweep_entries') as any)
        .select('horse_id').eq('tribe_id', tribeId).not('horse_id', 'is', null),
    ])
    const claimedHorseIds = new Set(((entries ?? []) as any[]).map(e => e.horse_id))
    const leftover = ((horses ?? []) as any[]).filter(h => !claimedHorseIds.has(h.id))

    if (leftover.length > 0) {
      const rows = leftover.map(h => ({ tribe_id: tribeId, user_id: user.id, horse_id: h.id }))
      const { error: insErr } = await (admin.from('sweep_entries') as any).insert(rows)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
      leftoverHorsesAssigned = leftover.length
    }
  }

  return NextResponse.json({ ok: true, locked: true, unspun_drawn: unspunDrawn, leftover_horses_assigned: leftoverHorsesAssigned })
}
