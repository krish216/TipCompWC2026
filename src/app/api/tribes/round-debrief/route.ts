import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { buildRoundDebrief } from '@/lib/round-debrief'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/tribes/round-debrief?tribe_id={id}&round=gs1
// Members-only satirical wrap-up of a single round for one tribe's members.
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const tribeId = url.searchParams.get('tribe_id')
    const round   = url.searchParams.get('round') || 'gs1'
    if (!tribeId) return NextResponse.json({ error: 'tribe_id required' }, { status: 400 })

    // Members-only gate (mirrors /api/tribes/report) — via tribe_members (users.tribe_id dropped in 044).
    const { data: tmRow } = await supabase.from('tribe_members')
      .select('tribe_id').eq('user_id', user.id).eq('tribe_id', tribeId).maybeSingle()
    if (!(tmRow as any)?.tribe_id) return NextResponse.json({ error: 'Not a member of this tribe' }, { status: 403 })

    const admin = createAdminClient()
    const { data: tribe } = await (admin.from('tribes') as any).select('id, name, tournament_id').eq('id', tribeId).single()
    if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })
    const tournId   = (tribe as any).tournament_id ?? null
    const tribeName = (tribe as any).name ?? 'Your Tribe'

    // 'gs'/'groups' = a combined Group Stage debrief (GS1+GS2+GS3); else one round.
    const GROUP_ROUNDS = ['gs1', 'gs2', 'gs3']
    const isGroupStage = round === 'gs' || round === 'groups'

    // Round name (fallback to "Round 1")
    let roundName = isGroupStage ? 'Group Stage' : 'Round 1'
    if (!isGroupStage && tournId) {
      const { data: tr } = await (admin.from('tournament_rounds') as any)
        .select('round_name').eq('tournament_id', tournId).eq('round_code', round).maybeSingle()
      if ((tr as any)?.round_name) roundName = (tr as any).round_name
    }

    // Members
    const { data: memberRows } = await (admin.from('tribe_members') as any)
      .select('user_id, users(id, display_name, first_name)').eq('tribe_id', tribeId)
    const members = ((memberRows ?? []) as any[]).map(m => ({
      user_id: m.users?.id ?? m.user_id,
      name:    m.users?.display_name ?? m.users?.first_name ?? 'Unknown',
    }))
    const memberIds = members.map(m => m.user_id)

    // Members who've made the GLOBAL leaderboard (top 50, as displayed) → 🌍 shout-out.
    const GLOBAL_BOARD_TOP_N = 50
    const globalRanks: Record<string, number> = {}
    if (memberIds.length && tournId) {
      const memberSet = new Set(memberIds)
      const { data: globalRows } = await (admin.from('leaderboard') as any)
        .select('user_id, total_points')
        .eq('tournament_id', tournId)
        .order('total_points', { ascending: false })
        .order('bonus_count', { ascending: false })
        .limit(GLOBAL_BOARD_TOP_N)
      ;((globalRows ?? []) as any[]).forEach((r, i) => {
        if (memberSet.has(r.user_id)) globalRanks[r.user_id] = i + 1
      })
    }

    const empty = buildRoundDebrief(round, roundName, tribeName, members, [], [], globalRanks)
    if (!memberIds.length || !tournId) return NextResponse.json(empty)

    // This round's fixtures (or all group-stage fixtures) + the tribe's predictions.
    let fxQuery = (admin.from('fixtures') as any)
      .select('id, home, away, home_score, away_score, pen_winner').eq('tournament_id', tournId)
    fxQuery = isGroupStage ? fxQuery.in('round', GROUP_ROUNDS) : fxQuery.eq('round', round)
    const { data: fxRows } = await fxQuery
    const fixtures = (fxRows ?? []) as any[]
    if (!fixtures.length) return NextResponse.json(empty)

    const fxIds = fixtures.map(f => f.id)
    const { data: predRows } = await (admin.from('predictions') as any)
      .select('user_id, fixture_id, home, away, outcome, points_earned').in('user_id', memberIds).in('fixture_id', fxIds)

    return NextResponse.json(buildRoundDebrief(round, roundName, tribeName, members, fixtures, (predRows ?? []) as any[], globalRanks))
  } catch (err: any) {
    console.error('[tribes/round-debrief]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
