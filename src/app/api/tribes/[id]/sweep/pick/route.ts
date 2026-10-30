import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { DRAW_OPENS_LABEL, loadField, overFieldTicketIds } from '@/lib/sweep/field'
import { drawHorseForTicket, maybeSendDrawConfirmation } from '@/lib/sweep/draw'

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
// draws landing on the same horse — the draw itself lives in lib/sweep/draw.ts.

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const tribeId = params.id

  const { data: tribe } = await (admin.from('tribes') as any)
    .select('id, tournament_id, sweep_locked_at').eq('id', tribeId).maybeSingle()
  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })
  if (tribe.sweep_locked_at) return NextResponse.json({ error: 'This pool is locked — no more picks.' }, { status: 409 })

  // Tickets can be sold before the field is known (migration 201), but nobody spins until
  // it's final — otherwise they'd draw a placeholder horse.
  const field = await loadField(admin, tribe.tournament_id)
  if (!field.drawOpen) {
    return NextResponse.json({ error: `The draw opens ${DRAW_OPENS_LABEL}, once the final field is declared — your ticket's safe until then.` }, { status: 409 })
  }

  // A short final field leaves the last tickets sold with no horse: those can't spin (the
  // organiser refunds them), so pick one of the caller's tickets that's within the field.
  const { data: poolEntries } = await (admin.from('sweep_entries') as any)
    .select('id, user_id, horse_id, joined_at').eq('tribe_id', tribeId)
  const overField = overFieldTicketIds((poolEntries ?? []) as any[], field)
  const myOpen = ((poolEntries ?? []) as any[]).filter(e => e.user_id === user.id && !e.horse_id)
  const myTicket = myOpen.find(e => !overField.has(e.id))
  if (!myTicket) {
    return NextResponse.json({
      error: myOpen.length
        ? 'The final field is smaller than the tickets sold in this pool, so your ticket has no horse — your organiser will refund it.'
        : 'You don’t have an unclaimed ticket in this pool',
    }, { status: 409 })
  }

  const res = await drawHorseForTicket(admin, { tribeId, tournamentId: tribe.tournament_id, ticketId: (myTicket as any).id })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
  await maybeSendDrawConfirmation(admin, { tribeId, tournamentId: tribe.tournament_id, userId: user.id })
  return NextResponse.json({ ok: true, horse: res.horse })
}
