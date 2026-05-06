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

// GET /api/comp-analytics/round-summary?comp_id={id}&round_code={code}
// End-of-round summary: top scorers, match accuracy for a completed round.
// { round_code, round_name, top_scorers: [{rank, user_id, display_name, points, correct_count}],
//   match_stats: [{fixture_id, home, away, correct_count, total_tippers, accuracy_pct}],
//   available_rounds: [{round_code, round_name}] }
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const compId    = searchParams.get('comp_id')
    const roundCode = searchParams.get('round_code')

    if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

    const admin = createAdminClient()
    if (!(await verifyCompAdmin(admin, user.id, compId)))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // 1. Get comp's tournament_id
    const { data: compRow } = await (admin.from('comps') as any)
      .select('tournament_id').eq('id', compId).single()
    const tournId: string | null = (compRow as any)?.tournament_id ?? null
    if (!tournId) return NextResponse.json({ available_rounds: [] })

    // 2. Get available closed rounds (tipping_closed=true) for this tournament
    const [{ data: lockRows }, { data: roundRows }] = await Promise.all([
      (admin.from('round_locks') as any)
        .select('round_code, tipping_closed')
        .eq('tournament_id', tournId)
        .eq('tipping_closed', true),
      (admin.from('tournament_rounds') as any)
        .select('round_code, round_name, round_order')
        .eq('tournament_id', tournId)
        .order('round_order', { ascending: true }),
    ])

    const closedCodes = new Set(((lockRows ?? []) as any[]).map((r: any) => r.round_code))
    const roundNameMap: Record<string, string> = {}
    ;((roundRows ?? []) as any[]).forEach((r: any) => { roundNameMap[r.round_code] = r.round_name })

    const availableRounds = ((roundRows ?? []) as any[])
      .filter((r: any) => closedCodes.has(r.round_code))
      .map((r: any) => ({ round_code: r.round_code, round_name: r.round_name }))

    // If no round_code specified, use the most recent closed round
    const targetRound = roundCode ?? availableRounds[availableRounds.length - 1]?.round_code ?? null
    if (!targetRound) return NextResponse.json({ available_rounds: availableRounds, round_code: null })

    // 3. Get fixtures for the round that have been scored (result_outcome not null)
    const { data: fixRows } = await admin
      .from('fixtures')
      .select('id, home, away, home_score, away_score, result_outcome')
      .eq('round', targetRound)
      .not('result_outcome', 'is', null)

    const fixtures = (fixRows ?? []) as any[]
    if (!fixtures.length) return NextResponse.json({ available_rounds: availableRounds, round_code: targetRound, round_name: roundNameMap[targetRound], top_scorers: [], match_stats: [] })

    const fixtureIds = fixtures.map((f: any) => f.id)

    // 4. Get all comp members
    const { data: memberRows } = await (admin.from('user_comps') as any)
      .select('user_id, users(id, display_name, first_name)')
      .eq('comp_id', compId)

    const members: { user_id: string; display_name: string }[] = ((memberRows ?? []) as any[]).map((m: any) => ({
      user_id:      m.users?.id ?? m.user_id,
      display_name: m.users?.display_name ?? m.users?.first_name ?? 'Unknown',
    }))
    const memberIds = members.map(m => m.user_id)

    if (!memberIds.length) return NextResponse.json({ available_rounds: availableRounds, round_code: targetRound, round_name: roundNameMap[targetRound], top_scorers: [], match_stats: [] })

    // 5. Get predictions for these fixtures by comp members
    const { data: predRows } = await (admin.from('predictions') as any)
      .select('user_id, fixture_id, points_earned, standard_points')
      .in('user_id', memberIds)
      .in('fixture_id', fixtureIds)

    const preds = (predRows ?? []) as any[]

    // 6. Aggregate per-user: sum of points_earned, count of correct (standard_points > 0)
    const userPoints:  Record<string, number> = {}
    const userCorrect: Record<string, number> = {}
    preds.forEach((p: any) => {
      userPoints[p.user_id]  = (userPoints[p.user_id]  ?? 0) + (Number(p.points_earned)   || 0)
      userCorrect[p.user_id] = (userCorrect[p.user_id] ?? 0) + ((Number(p.standard_points) > 0) ? 1 : 0)
    })

    const userMap = Object.fromEntries(members.map(m => [m.user_id, m.display_name]))
    const topScorers = Object.entries(userPoints)
      .map(([uid, pts]) => ({ user_id: uid, display_name: userMap[uid] ?? 'Unknown', points: pts, correct_count: userCorrect[uid] ?? 0 }))
      .sort((a, b) => b.points - a.points || b.correct_count - a.correct_count)
      .slice(0, 10)
      .map((s, i) => ({ rank: i + 1, ...s }))

    // 7. Per-match accuracy: how many comp members got each fixture correct
    const matchTippers: Record<number, number> = {}
    const matchCorrect: Record<number, number> = {}
    preds.forEach((p: any) => {
      matchTippers[p.fixture_id] = (matchTippers[p.fixture_id] ?? 0) + 1
      if (Number(p.standard_points) > 0) matchCorrect[p.fixture_id] = (matchCorrect[p.fixture_id] ?? 0) + 1
    })

    const matchStats = fixtures.map((f: any) => ({
      fixture_id:    f.id,
      home:          f.home,
      away:          f.away,
      home_score:    f.home_score,
      away_score:    f.away_score,
      result:        f.result_outcome,
      correct_count: matchCorrect[f.id] ?? 0,
      total_tippers: matchTippers[f.id] ?? 0,
      accuracy_pct:  (matchTippers[f.id] ?? 0) > 0
        ? Math.round(((matchCorrect[f.id] ?? 0) / matchTippers[f.id]) * 100)
        : 0,
    })).sort((a, b) => b.accuracy_pct - a.accuracy_pct)

    return NextResponse.json({
      available_rounds: availableRounds,
      round_code:       targetRound,
      round_name:       roundNameMap[targetRound] ?? targetRound,
      top_scorers:      topScorers,
      match_stats:      matchStats,
    })

  } catch (err: any) {
    console.error('[comp-analytics/round-summary]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
