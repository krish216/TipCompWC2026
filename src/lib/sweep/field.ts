// How many tickets a sweep pool can hold, and whether its draw is open (migration 201).
//
// Draw open (the field is final): one ticket per non-scratched horse, as always.
// Draw not open yet (selling before the barrier draw): the race's maximum field, so
// organisers can sell a full pool before the horses are known. If the final field comes in
// short, the LAST tickets sold in a pool are "over the field": they can't spin and the
// organiser refunds them (overFieldTicketIds, shown in sweep-admin's Pools tab).

export const MAX_FIELD = 24   // Melbourne Cup maximum field
export const DRAW_OPENS_LABEL = 'Saturday 31 October'   // after the barrier draw

export type SweepField = { drawOpen: boolean; runners: number; capacity: number }

export const capacityFor = (runners: number, drawOpen: boolean) => (drawOpen ? runners : MAX_FIELD)

export async function loadFields(admin: any, tournamentIds: string[]): Promise<Record<string, SweepField>> {
  const ids = [...new Set(tournamentIds.filter(Boolean))]
  if (!ids.length) return {}
  const [{ data: tourns, error }, { data: horses }] = await Promise.all([
    (admin.from('tournaments') as any).select('id, sweep_draw_open').in('id', ids),
    (admin.from('sweep_horses') as any).select('tournament_id').in('tournament_id', ids).eq('scratched', false),
  ])
  const runners: Record<string, number> = {}
  for (const h of (horses ?? []) as any[]) runners[h.tournament_id] = (runners[h.tournament_id] ?? 0) + 1
  const out: Record<string, SweepField> = {}
  // Before migration 201 the column doesn't exist — behave as before it (draw open, one
  // ticket per horse) rather than reading every pool as 0 tickets.
  for (const t of (error ? ids.map(id => ({ id })) : (tourns ?? [])) as any[]) {
    const drawOpen = t.sweep_draw_open !== false
    const n = runners[t.id] ?? 0
    out[t.id] = { drawOpen, runners: n, capacity: capacityFor(n, drawOpen) }
  }
  return out
}

export async function loadField(admin: any, tournamentId: string): Promise<SweepField> {
  return (await loadFields(admin, [tournamentId]))[tournamentId] ?? { drawOpen: true, runners: 0, capacity: 0 }
}

// Tickets beyond the field, once the draw is open: the latest-sold UNCLAIMED tickets that
// don't fit in the horses left after the ones already drawn. Empty while the draw is closed
// or the pool fits.
export function overFieldTicketIds(
  entries: { id: string; horse_id: string | null; joined_at: string | null }[], field: SweepField,
): Set<string> {
  if (!field.drawOpen || entries.length <= field.runners) return new Set()
  const drawn = entries.filter(e => e.horse_id).length
  const unclaimed = entries.filter(e => !e.horse_id).sort((a, b) =>
    (a.joined_at ?? '').localeCompare(b.joined_at ?? '') || a.id.localeCompare(b.id))
  return new Set(unclaimed.slice(Math.max(0, field.runners - drawn)).map(e => e.id))
}
