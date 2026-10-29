import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { PRACTICE_SLUG } from '@/lib/sweep/practice'
import { loadFields } from '@/lib/sweep/field'

export const dynamic = 'force-dynamic'

const TRIBE_COLS = 'id, name, invite_code, comp_id, tournament_id, sweep_locked_at'

// GET /api/sweep/my-pools — every sweep pool (tribe) relevant to the caller: the "My Pools"
// card's data source. A pool is relevant if the caller is a member of it, holds a pick in
// it, OR organises the comp it belongs to (every pool under a comp they admin, even ones
// they never personally joined — e.g. an overflow pool auto-created once pool 1 filled).
// Not scoped to the global selectedTournId the way comps/tournsComps is, since a sweep pool
// isn't tied to "the currently selected tournament" at all.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ data: [] })

  const admin = createAdminClient()

  const [{ data: memberRows }, { data: pickRows }, { data: adminCompRows }, { data: openRequestRows }] = await Promise.all([
    (admin.from('tribe_members') as any).select('tribe_id').eq('user_id', user.id),
    (admin.from('sweep_entries') as any).select('tribe_id, horse_id').eq('user_id', user.id),
    (admin.from('comp_admins') as any).select('comp_id').eq('user_id', user.id),
    // Pending/approved ticket requests — together with tickets, these mean "bought in", which
    // blocks leaving (see /api/comp-members/leave), so the card hides its Leave button.
    (admin.from('sweep_payment_requests') as any).select('tribe_id').eq('user_id', user.id).in('status', ['pending', 'approved']),
  ])
  const openRequestsByTribe: Record<string, number> = {}
  for (const r of (openRequestRows ?? []) as any[]) openRequestsByTribe[r.tribe_id] = (openRequestsByTribe[r.tribe_id] ?? 0) + 1
  const memberTribeIds = ((memberRows ?? []) as any[]).map(r => r.tribe_id)
  const pickTribeIds   = [...new Set(((pickRows ?? []) as any[]).map(r => r.tribe_id))]
  const adminCompIds   = ((adminCompRows ?? []) as any[]).map(r => r.comp_id)

  const ownTicketsByTribe: Record<string, { total: number; unclaimed: number }> = {}
  for (const e of (pickRows ?? []) as any[]) {
    const t = ownTicketsByTribe[e.tribe_id] ?? (ownTicketsByTribe[e.tribe_id] = { total: 0, unclaimed: 0 })
    t.total += 1
    if (!e.horse_id) t.unclaimed += 1
  }

  if (!memberTribeIds.length && !pickTribeIds.length && !adminCompIds.length) {
    return NextResponse.json({ data: [] })
  }

  const directTribeIds = [...new Set([...memberTribeIds, ...pickTribeIds])]
  const [{ data: directTribes }, { data: ownedTribes }] = await Promise.all([
    directTribeIds.length
      ? (admin.from('tribes') as any).select(TRIBE_COLS).in('id', directTribeIds)
      : Promise.resolve({ data: [] }),
    adminCompIds.length
      ? (admin.from('tribes') as any).select(TRIBE_COLS).in('comp_id', adminCompIds)
      : Promise.resolve({ data: [] }),
  ])
  const tribeById = new Map<string, any>()
  for (const t of [...(directTribes ?? []), ...(ownedTribes ?? [])]) tribeById.set(t.id, t)
  const allTribes = [...tribeById.values()]
  if (!allTribes.length) return NextResponse.json({ data: [] })

  const tournIds = [...new Set(allTribes.map(t => t.tournament_id).filter(Boolean))]
  const { data: tourns } = await (admin.from('tournaments') as any)
    .select('id, name, format, race_start_at, slug').in('id', tournIds)
  const sweepTournIds = new Set(((tourns ?? []) as any[]).filter(t => t.format === 'sweep').map(t => t.id))
  const tournById = Object.fromEntries(((tourns ?? []) as any[]).map(t => [t.id, t]))

  const sweepTribes = allTribes.filter(t => sweepTournIds.has(t.tournament_id))
  if (!sweepTribes.length) return NextResponse.json({ data: [] })

  const compIds = [...new Set(sweepTribes.map(t => t.comp_id))]

  // Pool pills need EVERY pool under each represented comp (not just the ones directly
  // relevant above) — a comp the caller organises may have pools with no personal
  // connection at all, but the pills should still cover the whole sweep.
  const [{ data: comps }, { data: allCompTribes }] = await Promise.all([
    (admin.from('comps') as any).select('id, name, invite_code').in('id', compIds),
    (admin.from('tribes') as any).select('id, comp_id, tournament_id').in('comp_id', compIds),
  ])
  const compById = Object.fromEntries(((comps ?? []) as any[]).map(c => [c.id, c]))
  const adminCompIdSet = new Set(adminCompIds)

  // Ticket count + fill status for every pool across every represented comp — a pool is
  // "full" once every ticket is SOLD (sweep_entries rows, whether spun yet or not), matching
  // the pool's capacity (lib/sweep/field.ts). Same rule as /api/sweep/offerings.
  const allTribeIds = ((allCompTribes ?? []) as any[]).map(t => t.id)
  // Pending payment requests only matter to organisers, so only fetch them for pools under
  // comps the caller admins — a plain member never sees anyone else's requests.
  const adminTribeIds = ((allCompTribes ?? []) as any[]).filter(t => adminCompIdSet.has(t.comp_id)).map(t => t.id)
  const [fields, { data: allEntries }, { data: pendingRows }] = await Promise.all([
    loadFields(admin, tournIds),
    allTribeIds.length
      ? (admin.from('sweep_entries') as any).select('tribe_id').in('tribe_id', allTribeIds)
      : Promise.resolve({ data: [] }),
    adminTribeIds.length
      ? (admin.from('sweep_payment_requests') as any).select('tribe_id').eq('status', 'pending').in('tribe_id', adminTribeIds)
      : Promise.resolve({ data: [] }),
  ])
  const compIdByTribe = Object.fromEntries(((allCompTribes ?? []) as any[]).map(t => [t.id, t.comp_id]))
  const pendingByComp: Record<string, number> = {}
  for (const r of (pendingRows ?? []) as any[]) {
    const c = compIdByTribe[r.tribe_id]
    pendingByComp[c] = (pendingByComp[c] ?? 0) + 1
  }
  const fieldSizeByTourn: Record<string, number> = Object.fromEntries(Object.entries(fields).map(([id, f]) => [id, f.capacity]))
  const soldByTribe: Record<string, number> = {}
  for (const e of (allEntries ?? []) as any[]) soldByTribe[e.tribe_id] = (soldByTribe[e.tribe_id] ?? 0) + 1

  const poolsByComp: Record<string, { tribe_id: string; tickets: number; field_size: number; full: boolean }[]> = {}
  for (const t of (allCompTribes ?? []) as any[]) {
    const fieldSize = fieldSizeByTourn[t.tournament_id] ?? 0
    const tickets = soldByTribe[t.id] ?? 0
    const full = fieldSize > 0 && tickets >= fieldSize
    ;(poolsByComp[t.comp_id] ??= []).push({ tribe_id: t.id, tickets, field_size: fieldSize, full })
  }

  const data = sweepTribes.map(t => ({
    tribe_id:        t.id,
    tribe_name:       t.name,
    comp_id:          t.comp_id,
    comp_name:        compById[t.comp_id]?.name ?? null,
    comp_invite_code: compById[t.comp_id]?.invite_code ?? null,
    tournament_id:    t.tournament_id,
    tournament_name:  tournById[t.tournament_id]?.name ?? null,
    race_start_at:    tournById[t.tournament_id]?.race_start_at ?? null,
    // Practice sweeps (migration 200) get their own card on /sweep, apart from real ones.
    is_practice:      tournById[t.tournament_id]?.slug === PRACTICE_SLUG,
    locked:           !!t.sweep_locked_at,
    is_comp_admin:    adminCompIdSet.has(t.comp_id),
    my_tickets:       ownTicketsByTribe[t.id]?.total ?? 0,
    my_unclaimed:     ownTicketsByTribe[t.id]?.unclaimed ?? 0,
    my_open_requests: openRequestsByTribe[t.id] ?? 0,
    comp_pools:       poolsByComp[t.comp_id] ?? [],
    // Comp-wide (every pool), and only populated for organisers.
    comp_pending_requests: pendingByComp[t.comp_id] ?? 0,
  }))

  return NextResponse.json({ data })
}
