import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { buildIntelligenceReport } from '@/lib/intelligence-report'

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

    // Members
    const { data: memberRows } = await (admin.from('user_comps') as any)
      .select('user_id, users(id, display_name, first_name)').eq('comp_id', compId)
    const members = ((memberRows ?? []) as any[]).map((m: any) => ({
      user_id: m.users?.id ?? m.user_id,
      name:    m.users?.display_name ?? m.users?.first_name ?? 'Unknown',
    }))
    const memberIds = members.map(m => m.user_id)
    if (!memberIds.length || !tournId) return NextResponse.json(buildIntelligenceReport(compName, members, [], 0))

    // Standings from the leaderboard matview (excludes warm-up / non-scoring rounds)
    let lbQ = (admin.from('leaderboard') as any)
      .select('user_id, total_points, correct_count, predictions_made').in('user_id', memberIds)
    if (tournId) lbQ = lbQ.eq('tournament_id', tournId)
    const { data: lbRows } = await lbQ

    // Bonus-team adoption
    const { data: utRows } = await (admin.from('user_tournaments') as any)
      .select('user_id, favourite_team').eq('tournament_id', tournId).in('user_id', memberIds)
    const favCount = ((utRows ?? []) as any[]).filter((r: any) => r.favourite_team).length

    return NextResponse.json(buildIntelligenceReport(compName, members, (lbRows ?? []) as any[], favCount))
  } catch (err: any) {
    console.error('[comp-analytics/report]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
