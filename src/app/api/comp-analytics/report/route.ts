import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

async function verifyCompAdmin(admin: any, userId: string, compId: string) {
  const [{ data: ca }, { data: ta }] = await Promise.all([
    (admin.from('comp_admins') as any).select('comp_id').eq('user_id', userId).eq('comp_id', compId).single(),
    admin.from('admin_users').select('user_id').eq('user_id', userId).single(),
  ])
  return !!(ca || ta)
}

// GET /api/comp-analytics/report?comp_id={id}
// Data for the satirical "Weekly Intelligence Report" (comp-admin only).
// Derived from the leaderboard matview (already excludes non-scoring rounds like warm-up).
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const compId = new URL(request.url).searchParams.get('comp_id')
    if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

    const admin = createAdminClient()
    if (!(await verifyCompAdmin(admin, user.id, compId)))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: compRow } = await (admin.from('comps') as any)
      .select('name, tournament_id').eq('id', compId).single()
    const compName = (compRow as any)?.name ?? 'Your Comp'
    const tournId  = (compRow as any)?.tournament_id ?? null

    const empty = {
      comp_name: compName, member_count: 0,
      leaders: [], laggards: [], ghosts: { count: 0, names: [] },
      stats: { total_members: 0, scored_count: 0, avg_points: 0, top_score: 0, bonus_team_pct: 0 },
    }

    // Members
    const { data: memberRows } = await (admin.from('user_comps') as any)
      .select('user_id, users(id, display_name, first_name)').eq('comp_id', compId)
    const members = ((memberRows ?? []) as any[]).map((m: any) => ({
      user_id: m.users?.id ?? m.user_id,
      name:    m.users?.display_name ?? m.users?.first_name ?? 'Unknown',
    }))
    const memberIds = members.map(m => m.user_id)
    if (!memberIds.length || !tournId) return NextResponse.json({ ...empty, comp_name: compName, member_count: members.length })

    // Standings from the leaderboard matview (excludes warm-up / non-scoring rounds)
    let lbQ = (admin.from('leaderboard') as any)
      .select('user_id, total_points, correct_count, predictions_made').in('user_id', memberIds)
    if (tournId) lbQ = lbQ.eq('tournament_id', tournId)
    const { data: lbRows } = await lbQ
    const lbMap: Record<string, any> = {}
    ;((lbRows ?? []) as any[]).forEach((r: any) => { lbMap[r.user_id] = r })

    // Bonus-team adoption
    const { data: utRows } = await (admin.from('user_tournaments') as any)
      .select('user_id, favourite_team').eq('tournament_id', tournId).in('user_id', memberIds)
    const favCount = ((utRows ?? []) as any[]).filter((r: any) => r.favourite_team).length

    const standings = members.map(m => {
      const lb = lbMap[m.user_id] ?? {}
      return {
        name:    m.name,
        points:  Number(lb.total_points ?? 0),
        correct: Number(lb.correct_count ?? 0),
        scored:  Number(lb.predictions_made ?? 0),
      }
    })

    const sortedDesc = [...standings].sort((a, b) => b.points - a.points || b.correct - a.correct)
    const leaders    = sortedDesc.filter(s => s.points > 0).slice(0, 4)
    const leaderSet  = new Set(leaders.map(l => l.name))
    const onBoard    = standings.filter(s => s.scored > 0)
    const laggards   = onBoard.filter(s => !leaderSet.has(s.name))
      .sort((a, b) => a.points - b.points || a.correct - b.correct).slice(0, 3)
    const ghosts     = standings.filter(s => s.scored === 0)

    return NextResponse.json({
      comp_name:    compName,
      member_count: members.length,
      leaders:      leaders.map(l => ({ name: l.name, points: l.points, correct: l.correct })),
      laggards:     laggards.map(l => ({ name: l.name, points: l.points })),
      ghosts:       { count: ghosts.length, names: ghosts.slice(0, 3).map(g => g.name) },
      stats: {
        total_members:  members.length,
        scored_count:   onBoard.length,
        avg_points:     standings.length ? Math.round((standings.reduce((s, x) => s + x.points, 0) / standings.length) * 10) / 10 : 0,
        top_score:      sortedDesc[0]?.points ?? 0,
        bonus_team_pct: members.length ? Math.round((favCount / members.length) * 100) : 0,
      },
    })
  } catch (err: any) {
    console.error('[comp-analytics/report]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
