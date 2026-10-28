import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { randomInt } from 'crypto'
import { sendSweepDrawConfirmation } from '@/lib/sweep/emails'

export const dynamic = 'force-dynamic'

// POST /api/tribes/:id/sweep/pick — draws ONE horse for one of the caller's unclaimed
// tickets (the wheel-spin moment). The SERVER draws it, uniformly at random from the
// pool's still-available, non-scratched horses — the client sends no horse at all. (It used
// to accept a client-sent horse_id, which let anyone claim the favourite with one hand-
// crafted request.) The wheel then animates to land on whatever was drawn.
//
// A person can hold several tickets; this fills exactly one, whichever is found first —
// tickets are fungible until claimed. Blocked once the pool is locked (manually or by the
// 30-min auto-lock). UNIQUE(tribe_id, horse_id) is the real guard against two concurrent
// draws landing on the same horse — on a 23505 we simply re-draw from what's left.
const MAX_DRAW_ATTEMPTS = 5

// Once this draw used the caller's LAST unclaimed ticket in the pool, email them every horse
// they hold there — one email per completed set, not one per spin (someone with 5 tickets
// gets 1 email). Buying more tickets later and drawing those sends a fresh, complete list.
// Never throws: a mail problem must not fail a draw that already happened.
async function maybeSendDrawConfirmation(admin: any, opts: { tribeId: string; tournamentId: string; userId: string }) {
  try {
    const { data: mine } = await (admin.from('sweep_entries') as any)
      .select('horse_id').eq('tribe_id', opts.tribeId).eq('user_id', opts.userId)
    const rows = (mine ?? []) as { horse_id: string | null }[]
    if (!rows.length || rows.some(r => !r.horse_id)) return   // still has tickets to spin

    const [{ data: horses }, { data: tribe }, { data: tourn }, { data: user }, { count: fieldSize }, { count: drawn }] = await Promise.all([
      (admin.from('sweep_horses') as any).select('number, name').in('id', rows.map(r => r.horse_id)),
      (admin.from('tribes') as any).select('name, comp_id, comps(name)').eq('id', opts.tribeId).maybeSingle(),
      (admin.from('tournaments') as any).select('name, race_start_at').eq('id', opts.tournamentId).maybeSingle(),
      (admin.from('users') as any).select('email, display_name').eq('id', opts.userId).maybeSingle(),
      (admin.from('sweep_horses') as any).select('id', { count: 'exact', head: true }).eq('tournament_id', opts.tournamentId).eq('scratched', false),
      (admin.from('sweep_entries') as any).select('id', { count: 'exact', head: true }).eq('tribe_id', opts.tribeId).not('horse_id', 'is', null),
    ])
    if (!(user as any)?.email || !(horses ?? []).length) return
    const comp = Array.isArray((tribe as any)?.comps) ? (tribe as any).comps[0] : (tribe as any)?.comps

    await sendSweepDrawConfirmation({
      email:       (user as any).email,
      name:        (user as any).display_name,
      compName:    comp?.name ?? 'your sweep',
      tribeName:   (tribe as any)?.name ?? '',
      raceName:    (tourn as any)?.name ?? null,
      raceStartAt: (tourn as any)?.race_start_at ?? null,
      horses:      horses as { number: number; name: string }[],
      poolFull:    fieldSize != null && fieldSize > 0 && (drawn ?? 0) >= fieldSize,
      compId:      (tribe as any)?.comp_id,
    })
  } catch (e: any) {
    console.error('[sweep/pick] draw-confirmation error:', e?.message ?? e)
  }
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const tribeId = params.id

  const { data: tribe } = await (admin.from('tribes') as any)
    .select('id, tournament_id, sweep_locked_at').eq('id', tribeId).maybeSingle()
  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })
  if (tribe.sweep_locked_at) return NextResponse.json({ error: 'This pool is locked — no more picks.' }, { status: 409 })

  const { data: myTicket } = await (admin.from('sweep_entries') as any)
    .select('id').eq('tribe_id', tribeId).eq('user_id', user.id).is('horse_id', null).limit(1).maybeSingle()
  if (!myTicket) {
    return NextResponse.json({ error: 'You don’t have an unclaimed ticket in this pool' }, { status: 409 })
  }

  for (let attempt = 0; attempt < MAX_DRAW_ATTEMPTS; attempt++) {
    const [{ data: field }, { data: taken }] = await Promise.all([
      (admin.from('sweep_horses') as any)
        .select('id, number, name, scratched, finish_position').eq('tournament_id', tribe.tournament_id).eq('scratched', false),
      (admin.from('sweep_entries') as any).select('horse_id').eq('tribe_id', tribeId).not('horse_id', 'is', null),
    ])
    const takenIds = new Set(((taken ?? []) as any[]).map(e => e.horse_id))
    const open = ((field ?? []) as any[]).filter(h => !takenIds.has(h.id))
    if (!open.length) return NextResponse.json({ error: 'No horses left to draw — the pool’s full.' }, { status: 409 })

    const horse = open[randomInt(open.length)]
    const { data: updated, error } = await (admin.from('sweep_entries') as any)
      .update({ horse_id: horse.id })
      .eq('id', (myTicket as any).id)
      .is('horse_id', null)   // never clobber if it was somehow already filled
      .select('id').maybeSingle()

    if (error?.code === '23505') continue   // someone drew that horse a split-second earlier — re-draw
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated) return NextResponse.json({ error: 'That ticket was already used — try spinning again' }, { status: 409 })

    await maybeSendDrawConfirmation(admin, { tribeId, tournamentId: tribe.tournament_id, userId: user.id })
    return NextResponse.json({ ok: true, horse })
  }
  return NextResponse.json({ error: 'Busy moment — spin again.' }, { status: 409 })
}
