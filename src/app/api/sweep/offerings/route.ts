import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/sweep/offerings — public, no auth required (same discoverability rule as
// regular comp browsing): every comp whose tournament is format='sweep' and that has
// opted into comps.is_discoverable (migration 106 — reused as-is, not reinvented). This is
// what "a buyer picks a particular sweep among what is offered" actually needs — a listing
// across comps, since the pool/tribe within a comp is an implementation detail decided by
// the usual auto-placement, not something the buyer chooses directly.
export async function GET() {
  const admin = createAdminClient()

  const { data: comps } = await (admin.from('comps') as any)
    .select('id, name, logo_url, tournament_id, tournaments(name, race_start_at, format)')
    .eq('is_discoverable', true)

  const sweepComps = ((comps ?? []) as any[]).filter(c => c.tournaments?.format === 'sweep')
  if (!sweepComps.length) return NextResponse.json({ data: [], tournaments: [] })

  const compIds = sweepComps.map(c => c.id)
  const tournIds = [...new Set(sweepComps.map(c => c.tournament_id))]
  const { data: tribeRows } = await (admin.from('tribes') as any)
    .select('id, comp_id').in('comp_id', compIds)
  const tribeIds = ((tribeRows ?? []) as any[]).map(t => t.id)

  // Per-pool ticket count and fill status — a pool is "full" once every ticket (sold, not
  // necessarily spun yet) matches the non-scratched field size. Drives the pool pills.
  const [{ data: horses }, { data: entries }] = await Promise.all([
    (admin.from('sweep_horses') as any).select('tournament_id, scratched').in('tournament_id', tournIds),
    tribeIds.length
      ? (admin.from('sweep_entries') as any).select('tribe_id').in('tribe_id', tribeIds)
      : Promise.resolve({ data: [] }),
  ])
  const fieldSizeByTourn: Record<string, number> = {}
  for (const h of (horses ?? []) as any[]) {
    if (!h.scratched) fieldSizeByTourn[h.tournament_id] = (fieldSizeByTourn[h.tournament_id] ?? 0) + 1
  }
  const ticketsByTribe: Record<string, number> = {}
  for (const e of (entries ?? []) as any[]) ticketsByTribe[e.tribe_id] = (ticketsByTribe[e.tribe_id] ?? 0) + 1

  const poolsByComp: Record<string, { tribe_id: string; tickets: number; field_size: number; full: boolean }[]> = {}
  for (const t of (tribeRows ?? []) as any[]) {
    const comp = sweepComps.find(c => c.id === t.comp_id)
    const fieldSize = comp ? (fieldSizeByTourn[comp.tournament_id] ?? 0) : 0
    const tickets = ticketsByTribe[t.id] ?? 0
    const full = fieldSize > 0 && tickets >= fieldSize
    ;(poolsByComp[t.comp_id] ??= []).push({ tribe_id: t.id, tickets, field_size: fieldSize, full })
  }

  const data = sweepComps.map(c => ({
    comp_id:         c.id,
    comp_name:       c.name,
    logo_url:        c.logo_url ?? null,
    tournament_id:   c.tournament_id,
    tournament_name: c.tournaments?.name ?? null,
    race_start_at:   c.tournaments?.race_start_at ?? null,
    pools:           poolsByComp[c.id] ?? [],
  }))

  // Distinct sweep tournaments represented in this list — drives the tournament switcher.
  // Multiple sweeps can legitimately be live at once (several races in the same carnival),
  // so this is a filter the person picks from, not a single "active tournament" the way
  // football tournaments work.
  const tournamentsById = new Map<string, { tournament_id: string; tournament_name: string | null; race_start_at: string | null }>()
  for (const d of data) {
    if (!tournamentsById.has(d.tournament_id)) {
      tournamentsById.set(d.tournament_id, { tournament_id: d.tournament_id, tournament_name: d.tournament_name, race_start_at: d.race_start_at })
    }
  }
  const tournaments = [...tournamentsById.values()].sort((a, b) => (a.race_start_at ?? '').localeCompare(b.race_start_at ?? ''))

  return NextResponse.json({ data, tournaments })
}
