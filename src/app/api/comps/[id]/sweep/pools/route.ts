import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { computePoolPrizes, isValidSplit, poolFeeShares } from '@/lib/sweep/prizes'
import { loadField, overFieldTicketIds } from '@/lib/sweep/field'

export const dynamic = 'force-dynamic'

// GET /api/comps/:id/sweep/pools — comp-admin/platform-admin only. Every tribe (pool) under
// the comp, with member count, ticket count, and lock state — backs the organiser page's
// "Pools" tab (list + the "Close pool" action, which lives on the per-tribe close route).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const [{ data: compAdminRow }, { data: platformAdmin }] = await Promise.all([
    (admin.from('comp_admins') as any).select('user_id').eq('comp_id', params.id).eq('user_id', user.id).maybeSingle(),
    (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  if (!compAdminRow && !platformAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: tribes } = await (admin.from('tribes') as any)
    .select('id, name, invite_code, sweep_locked_at, created_at').eq('comp_id', params.id).order('created_at', { ascending: true })
  const tribeIds = ((tribes ?? []) as any[]).map(t => t.id)
  if (!tribeIds.length) return NextResponse.json({ data: [] })

  // Field size = what each pool can sell (lib/sweep/field.ts: one ticket per non-scratched
  // horse, or the race's maximum field before the draw opens) — the "of N" the organiser
  // actually wants next to tickets sold.
  const { data: comp } = await (admin.from('comps') as any)
    .select('tournament_id, sweep_ticket_price_cents, sweep_prize_split, sweep_deduct_fee').eq('id', params.id).maybeSingle()
  const [{ data: memberRows }, { data: entryRows }, field] = await Promise.all([
    (admin.from('tribe_members') as any).select('tribe_id').in('tribe_id', tribeIds),
    (admin.from('sweep_entries') as any).select('id, tribe_id, user_id, horse_id, joined_at').in('tribe_id', tribeIds),
    loadField(admin, (comp as any)?.tournament_id),
  ])
  const fieldSize = field.capacity

  // A short final field: per pool, who holds tickets that can't spin and needs a refund.
  const entriesByTribe: Record<string, any[]> = {}
  for (const e of (entryRows ?? []) as any[]) (entriesByTribe[e.tribe_id] ??= []).push(e)
  const refundByTribe: Record<string, Record<string, number>> = {}
  for (const [tid, rows] of Object.entries(entriesByTribe)) {
    const over = overFieldTicketIds(rows, field)
    for (const e of rows) if (over.has(e.id)) ((refundByTribe[tid] ??= {})[e.user_id] = (refundByTribe[tid]?.[e.user_id] ?? 0) + 1)
  }
  const refundUserIds = [...new Set(Object.values(refundByTribe).flatMap(m => Object.keys(m)))]
  const { data: refundUsers } = refundUserIds.length
    ? await (admin.from('users') as any).select('id, display_name').in('id', refundUserIds)
    : { data: [] }
  const nameById = Object.fromEntries(((refundUsers ?? []) as any[]).map(u => [u.id, u.display_name ?? 'Someone']))
  const memberCount: Record<string, number> = {}
  for (const m of (memberRows ?? []) as any[]) memberCount[m.tribe_id] = (memberCount[m.tribe_id] ?? 0) + 1
  const ticketCount: Record<string, number> = {}
  const claimedCount: Record<string, number> = {}
  for (const e of (entryRows ?? []) as any[]) {
    ticketCount[e.tribe_id] = (ticketCount[e.tribe_id] ?? 0) + 1
    if (e.horse_id) claimedCount[e.tribe_id] = (claimedCount[e.tribe_id] ?? 0) + 1
  }

  // Each pool's pot as it stands (tickets sold × price, less its fee share) — null when the
  // sweep has no ticket price yet.
  const price = (comp as any)?.sweep_ticket_price_cents ?? null
  const split = isValidSplit((comp as any)?.sweep_prize_split) ? (comp as any).sweep_prize_split : [70, 20, 10]
  const feeShares = price ? await poolFeeShares(admin, params.id, (comp as any)?.sweep_deduct_fee !== false) : {}

  const data = ((tribes ?? []) as any[]).map(t => ({
    id: t.id, name: t.name, invite_code: t.invite_code, locked: !!t.sweep_locked_at,
    members: memberCount[t.id] ?? 0, tickets: ticketCount[t.id] ?? 0, claimed: claimedCount[t.id] ?? 0,
    field_size: fieldSize,
    draw_open: field.drawOpen,
    refunds: Object.entries(refundByTribe[t.id] ?? {}).map(([uid, tickets]) => ({ display_name: nameById[uid] ?? 'Someone', tickets })),
    prizes: price ? computePoolPrizes({ ticketPriceCents: price, ticketsSold: ticketCount[t.id] ?? 0, split, feeCents: feeShares[t.id] ?? 0 }) : null,
  }))

  return NextResponse.json({ data })
}
