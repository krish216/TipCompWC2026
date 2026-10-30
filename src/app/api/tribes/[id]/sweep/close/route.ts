import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { DRAW_OPENS_LABEL, loadField } from '@/lib/sweep/field'
import { drawUnspunTickets } from '@/lib/sweep/draw'

export const dynamic = 'force-dynamic'

// POST /api/tribes/:id/sweep/close — comp-admin only. Distinct from sweep/lock: lock only
// ever meant "stop new joins" (migration 190) and isn't re-runnable; close is the explicit
// "finalize this draw" action — it locks if not already locked, draws a horse for every
// ticket its holder never spun (lib/sweep/draw.ts). Unsold horses stay unsold — nobody,
// organiser included, is ever handed them (an organiser winning their own sweep looks bad);
// prizes roll down to the best-finishing horses the pool holds instead (lib/sweep/podium.ts).
// (comps.sweep_leftover_mode is left in place but no longer read.)
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

  // Drawing every unspun ticket needs the real field.
  if (!(await loadField(admin, tribe.tournament_id)).drawOpen) {
    return NextResponse.json({ error: `You can close the pool once the draw opens (${DRAW_OPENS_LABEL}). To stop new joins now, lock it instead.` }, { status: 409 })
  }

  if (!tribe.sweep_locked_at) {
    await (admin.from('tribes') as any)
      .update({ sweep_locked_at: new Date().toISOString() }).eq('id', tribeId).is('sweep_locked_at', null)
  }

  const { drawn: unspunDrawn } = await drawUnspunTickets(admin, { tribeId, tournamentId: tribe.tournament_id })

  return NextResponse.json({ ok: true, locked: true, unspun_drawn: unspunDrawn })
}
