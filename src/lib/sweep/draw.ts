import { randomInt } from 'crypto'
import { sendSweepDrawConfirmation } from '@/lib/sweep/emails'
import { loadField, overFieldTicketIds } from '@/lib/sweep/field'

// The one random draw behind every horse a ticket gets — the buyer's own wheel spin
// (sweep/pick), the organiser's "Draw for unspun tickets" (sweep/draw-unspun), closing a
// pool (sweep/close) and the 30-minute auto-lock cron. The SERVER draws, uniformly at random
// from the pool's still-available, non-scratched horses; nobody ever chooses a horse.
// UNIQUE(tribe_id, horse_id) is the real guard against two concurrent draws landing on the
// same horse — on a 23505 we simply re-draw from what's left.
const MAX_DRAW_ATTEMPTS = 5

type DrawResult =
  | { ok: true; horse: { id: string; number: number; name: string } }
  | { ok: false; error: string; status: number }

export async function drawHorseForTicket(
  admin: any, opts: { tribeId: string; tournamentId: string; ticketId: string },
): Promise<DrawResult> {
  for (let attempt = 0; attempt < MAX_DRAW_ATTEMPTS; attempt++) {
    const [{ data: field }, { data: taken }] = await Promise.all([
      (admin.from('sweep_horses') as any)
        .select('id, number, name, scratched, finish_position').eq('tournament_id', opts.tournamentId).eq('scratched', false),
      (admin.from('sweep_entries') as any).select('horse_id').eq('tribe_id', opts.tribeId).not('horse_id', 'is', null),
    ])
    const takenIds = new Set(((taken ?? []) as any[]).map(e => e.horse_id))
    const open = ((field ?? []) as any[]).filter(h => !takenIds.has(h.id))
    if (!open.length) return { ok: false, error: 'No horses left to draw — the pool’s full.', status: 409 }

    const horse = open[randomInt(open.length)]
    const { data: updated, error } = await (admin.from('sweep_entries') as any)
      .update({ horse_id: horse.id })
      .eq('id', opts.ticketId)
      .is('horse_id', null)   // never clobber if it was somehow already filled
      .select('id').maybeSingle()

    if (error?.code === '23505') continue   // someone drew that horse a split-second earlier — re-draw
    if (error) return { ok: false, error: error.message, status: 500 }
    if (!updated) return { ok: false, error: 'That ticket was already used — try spinning again', status: 409 }
    return { ok: true, horse }
  }
  return { ok: false, error: 'Busy moment — spin again.', status: 409 }
}

// Draws a horse for every ticket in the pool that's still unspun (skipping a short final
// field's over-field tickets, which get refunded), then emails each holder their horses.
// `userId` narrows it to one holder's tickets (a buyer who asked for auto-draw, migration
// 203). Idempotent — a second run finds nothing to draw. Does nothing while the draw is closed.
export async function drawUnspunTickets(
  admin: any, opts: { tribeId: string; tournamentId: string; userId?: string },
): Promise<{ drawn: number; failed: number }> {
  const field = await loadField(admin, opts.tournamentId)
  if (!field.drawOpen) return { drawn: 0, failed: 0 }

  const { data: entries } = await (admin.from('sweep_entries') as any)
    .select('id, user_id, horse_id, joined_at').eq('tribe_id', opts.tribeId)
  const overField = overFieldTicketIds((entries ?? []) as any[], field)
  const unspun = ((entries ?? []) as any[]).filter(e =>
    !e.horse_id && !overField.has(e.id) && (!opts.userId || e.user_id === opts.userId))

  let drawn = 0, failed = 0
  const holders = new Set<string>()
  for (const ticket of unspun) {
    const res = await drawHorseForTicket(admin, { tribeId: opts.tribeId, tournamentId: opts.tournamentId, ticketId: ticket.id })
    if (res.ok) { drawn++; holders.add(ticket.user_id) } else failed++
  }
  for (const userId of holders) await maybeSendDrawConfirmation(admin, { tribeId: opts.tribeId, tournamentId: opts.tournamentId, userId })
  return { drawn, failed }
}

// After a request's tickets are granted: if the buyer asked for auto-draw (migration 203),
// draw their unspun tickets now. Never throws — a failed draw leaves the tickets to spin.
export async function autoDrawIfRequested(
  admin: any, opts: { tribeId: string; tournamentId: string; userId: string; autoDraw: boolean | null | undefined },
): Promise<void> {
  if (!opts.autoDraw) return
  try {
    await drawUnspunTickets(admin, { tribeId: opts.tribeId, tournamentId: opts.tournamentId, userId: opts.userId })
  } catch (e: any) {
    console.error('[sweep/draw] auto-draw failed:', e?.message ?? e)
  }
}

// When an admin opens a race's draw: draw for every buyer whose auto-draw request was
// granted while the draw was still closed. Returns how many tickets were drawn.
export async function drawPendingAutoDraws(admin: any, tournamentId: string): Promise<number> {
  const { data: tribes } = await (admin.from('tribes') as any).select('id').eq('tournament_id', tournamentId)
  const tribeIds = ((tribes ?? []) as any[]).map(t => t.id)
  if (!tribeIds.length) return 0
  const { data: reqs, error } = await (admin.from('sweep_payment_requests') as any)
    .select('tribe_id, user_id').in('tribe_id', tribeIds).eq('status', 'approved').eq('auto_draw', true)
  if (error) return 0   // before migration 203 — nobody can have asked for it
  const pairs = new Map<string, { tribeId: string; userId: string }>()
  for (const r of (reqs ?? []) as any[]) pairs.set(`${r.tribe_id}:${r.user_id}`, { tribeId: r.tribe_id, userId: r.user_id })
  let drawn = 0
  for (const p of pairs.values()) drawn += (await drawUnspunTickets(admin, { ...p, tournamentId })).drawn
  return drawn
}

// Once a holder has no unspun tickets left in the pool, email them every horse they hold
// there — one email per completed set, not one per spin (someone with 5 tickets gets 1
// email). Buying more tickets later and drawing those sends a fresh, complete list.
// Never throws: a mail problem must not fail a draw that already happened.
export async function maybeSendDrawConfirmation(admin: any, opts: { tribeId: string; tournamentId: string; userId: string }) {
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
    console.error('[sweep/draw] draw-confirmation error:', e?.message ?? e)
  }
}
