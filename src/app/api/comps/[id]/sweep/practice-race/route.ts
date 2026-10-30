import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { isPracticeTournament } from '@/lib/sweep/practice'

export const dynamic = 'force-dynamic'

// POST /api/comps/:id/sweep/practice-race — the organiser of a PRACTICE sweep runs its race:
// one random full finishing order for the whole sweep, the same in every pool (like the real
// Cup), stored on each pool's tribes.practice_results (the practice field is shared by every
// practice sweep, so sweep_horses.finish_position can't hold it). Prizes roll down to each
// pool's best-finishing horses (lib/sweep/podium.ts). Every pool locks, which also reveals the
// draw. Only once every ticket sold has a horse — racing with tickets unspun would leave them
// out. Running it again re-rolls. DELETE clears it and reopens every pool.
async function gate(compId: string) {
  const user = await getSessionUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient()
  const [{ data: comp }, { data: isAdmin }] = await Promise.all([
    (admin.from('comps') as any).select('id, tournament_id').eq('id', compId).maybeSingle(),
    (admin.from('comp_admins') as any).select('user_id').eq('comp_id', compId).eq('user_id', user.id).maybeSingle(),
  ])
  if (!comp) return { error: NextResponse.json({ error: 'Sweep not found' }, { status: 404 }) }
  if (!(await isPracticeTournament(admin, comp.tournament_id))) {
    return { error: NextResponse.json({ error: 'Only practice sweeps can run a pretend race' }, { status: 400 }) }
  }
  if (!isAdmin) return { error: NextResponse.json({ error: 'Only the organiser can run the race' }, { status: 403 }) }
  const { data: tribes } = await (admin.from('tribes') as any).select('id').eq('comp_id', compId)
  return { admin, comp, tribeIds: ((tribes ?? []) as any[]).map(t => t.id) }
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params.id)
  if ('error' in g) return g.error
  const { admin, comp, tribeIds } = g

  const [{ data: horses }, { data: entries }] = await Promise.all([
    (admin.from('sweep_horses') as any).select('id').eq('tournament_id', comp.tournament_id).eq('scratched', false),
    tribeIds.length ? (admin.from('sweep_entries') as any).select('horse_id').in('tribe_id', tribeIds) : Promise.resolve({ data: [] }),
  ])
  const sold = ((entries ?? []) as any[]).length
  const unspun = ((entries ?? []) as any[]).filter(e => !e.horse_id).length
  if (!sold) return NextResponse.json({ error: 'Sell and draw some tickets first.' }, { status: 409 })
  if (unspun) return NextResponse.json({ error: `${unspun} ticket${unspun === 1 ? ' is' : 's are'} still to spin — draw for them first.` }, { status: 409 })

  const order = ((horses ?? []) as any[]).map(h => h.id)
  if (order.length < 3) return NextResponse.json({ error: 'The practice field needs at least 3 horses' }, { status: 400 })
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const { error } = await (admin.from('tribes') as any)
    .update({ practice_results: order, sweep_locked_at: new Date().toISOString() }).in('id', tribeIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gate(params.id)
  if ('error' in g) return g.error
  const { error } = await (g.admin.from('tribes') as any)
    .update({ practice_results: null, sweep_locked_at: null }).in('id', g.tribeIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
