import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { buildIntelligenceReport } from '@/lib/intelligence-report'

export const dynamic = 'force-dynamic'

// GET /api/tribes/report?tribe_id={id}
// Members-only satirical "Weekly Intelligence Report" scoped to a single tribe's
// members. Returns 403 to non-members. Data from the leaderboard matview (excludes
// non-scoring rounds like warm-up).
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tribeId = new URL(request.url).searchParams.get('tribe_id')
    if (!tribeId) return NextResponse.json({ error: 'tribe_id required' }, { status: 400 })

    // Members-only gate (mirrors /api/chat membership check) — via tribe_members (users.tribe_id dropped in 044).
    const { data: tmRow } = await supabase.from('tribe_members')
      .select('tribe_id').eq('user_id', user.id).eq('tribe_id', tribeId).maybeSingle()
    if (!(tmRow as any)?.tribe_id) return NextResponse.json({ error: 'Not a member of this tribe' }, { status: 403 })

    const admin = createAdminClient()
    const { data: tribe } = await (admin.from('tribes') as any)
      .select('id, name, tournament_id').eq('id', tribeId).single()
    if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })
    const tournId = (tribe as any).tournament_id ?? null
    const tribeName = (tribe as any).name ?? 'Your Tribe'

    const { data: memberRows } = await (admin.from('tribe_members') as any)
      .select('user_id, users(id, display_name, first_name)').eq('tribe_id', tribeId)
    const members = ((memberRows ?? []) as any[]).map((m: any) => ({
      user_id: m.users?.id ?? m.user_id,
      name:    m.users?.display_name ?? m.users?.first_name ?? 'Unknown',
    }))
    const memberIds = members.map(m => m.user_id)
    if (!memberIds.length || !tournId) return NextResponse.json(buildIntelligenceReport(tribeName, members, [], 0))

    let lbQ = (admin.from('leaderboard') as any)
      .select('user_id, total_points, correct_count, predictions_made').in('user_id', memberIds)
    if (tournId) lbQ = lbQ.eq('tournament_id', tournId)
    const { data: lbRows } = await lbQ

    const { data: utRows } = await (admin.from('user_tournaments') as any)
      .select('user_id, favourite_team').eq('tournament_id', tournId).in('user_id', memberIds)
    const favCount = ((utRows ?? []) as any[]).filter((r: any) => r.favourite_team).length

    return NextResponse.json(buildIntelligenceReport(tribeName, members, (lbRows ?? []) as any[], favCount))
  } catch (err: any) {
    console.error('[tribes/report]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
