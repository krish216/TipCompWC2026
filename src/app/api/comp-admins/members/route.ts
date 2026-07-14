import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/comp-admins/members?comp_id= — list a comp's members for its admins.
// Rebuilt after migration 044 dropped users.tribe_id / users.org_id: membership now comes from
// user_comps, tribe status from tribe_members, and predictions from the leaderboard view.
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const compId = new URL(request.url).searchParams.get('comp_id')
  if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Authorise: comp admin, comp owner, or tournament admin.
  const [{ data: compAdmin }, { data: comp }, { data: tournamentAdmin }] = await Promise.all([
    (admin.from('comp_admins') as any).select('comp_id').eq('user_id', user.id).eq('comp_id', compId).maybeSingle(),
    (admin.from('comps') as any).select('created_by, tournament_id').eq('id', compId).maybeSingle(),
    (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  if (!comp) return NextResponse.json({ error: 'Comp not found' }, { status: 404 })
  const authorized = !!compAdmin || (comp as any).created_by === user.id || !!tournamentAdmin
  if (!authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Members of the comp (user_comps → users).
  const { data: ucs } = await (admin.from('user_comps') as any)
    .select('user_id, users(id, display_name, email)').eq('comp_id', compId)
  const rows = (ucs ?? []) as any[]
  const memberIds = rows.map(r => r.user_id)

  // Which members are in a tribe for this comp → their tribe_id.
  const tribeByUser = new Map<string, string>()
  const { data: tribes } = await (admin.from('tribes') as any).select('id').eq('comp_id', compId)
  const tribeIds = ((tribes ?? []) as any[]).map(t => t.id)
  if (tribeIds.length) {
    const { data: tms } = await (admin.from('tribe_members') as any)
      .select('user_id, tribe_id').in('tribe_id', tribeIds)
    for (const m of ((tms ?? []) as any[])) if (!tribeByUser.has(m.user_id)) tribeByUser.set(m.user_id, m.tribe_id)
  }

  // Predictions made per member (leaderboard for the comp's tournament).
  const predsByUser = new Map<string, number>()
  const tid = (comp as any).tournament_id
  if (tid && memberIds.length) {
    const { data: lb } = await (admin.from('leaderboard') as any)
      .select('user_id, predictions_made').eq('tournament_id', tid).in('user_id', memberIds)
    for (const r of ((lb ?? []) as any[])) predsByUser.set(r.user_id, r.predictions_made ?? 0)
  }

  const members = rows.map(r => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users
    return {
      id:               r.user_id,
      display_name:     u?.display_name ?? 'Unknown',
      email:            u?.email ?? null,
      tribe_id:         tribeByUser.get(r.user_id) ?? null,
      predictions_made: predsByUser.get(r.user_id) ?? 0,
    }
  }).sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''))

  return NextResponse.json({ data: members })
}
