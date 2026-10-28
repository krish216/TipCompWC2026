import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

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

  // Field size = what each pool can sell (one ticket per non-scratched horse) — the "of N"
  // the organiser actually wants next to tickets sold.
  const { data: comp } = await (admin.from('comps') as any).select('tournament_id').eq('id', params.id).maybeSingle()
  const [{ data: memberRows }, { data: entryRows }, { count: fieldSize }] = await Promise.all([
    (admin.from('tribe_members') as any).select('tribe_id').in('tribe_id', tribeIds),
    (admin.from('sweep_entries') as any).select('tribe_id, horse_id').in('tribe_id', tribeIds),
    (admin.from('sweep_horses') as any).select('id', { count: 'exact', head: true })
      .eq('tournament_id', (comp as any)?.tournament_id).eq('scratched', false),
  ])
  const memberCount: Record<string, number> = {}
  for (const m of (memberRows ?? []) as any[]) memberCount[m.tribe_id] = (memberCount[m.tribe_id] ?? 0) + 1
  const ticketCount: Record<string, number> = {}
  const claimedCount: Record<string, number> = {}
  for (const e of (entryRows ?? []) as any[]) {
    ticketCount[e.tribe_id] = (ticketCount[e.tribe_id] ?? 0) + 1
    if (e.horse_id) claimedCount[e.tribe_id] = (claimedCount[e.tribe_id] ?? 0) + 1
  }

  const data = ((tribes ?? []) as any[]).map(t => ({
    id: t.id, name: t.name, invite_code: t.invite_code, locked: !!t.sweep_locked_at,
    members: memberCount[t.id] ?? 0, tickets: ticketCount[t.id] ?? 0, claimed: claimedCount[t.id] ?? 0,
    field_size: fieldSize ?? 0,
  }))

  return NextResponse.json({ data })
}
