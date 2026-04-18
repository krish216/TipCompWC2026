import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/demo/leaderboard?tournament_id=
// Public — no auth required. Returns ranked tipsters by total demo points.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tournament_id = searchParams.get('tournament_id')
  if (!tournament_id) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Get all demo fixture ids for this tournament
  const { data: demoFx } = await (admin.from('demo_fixtures') as any)
    .select('id')
    .eq('tournament_id', tournament_id)

  const fixtureIds = (demoFx ?? []).map((f: any) => f.id)
  if (!fixtureIds.length) return NextResponse.json({ data: [], total_fixtures: 0 })

  // Aggregate points per user
  const { data: pointRows, error } = await (admin.from('demo_points') as any)
    .select('user_id, points, is_correct')
    .in('demo_fixture_id', fixtureIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aggregate by user
  const userMap: Record<string, { total_points: number; correct: number; predictions: number }> = {}
  ;(pointRows ?? []).forEach((p: any) => {
    if (!userMap[p.user_id]) userMap[p.user_id] = { total_points: 0, correct: 0, predictions: 0 }
    userMap[p.user_id].total_points += p.points
    userMap[p.user_id].correct      += p.is_correct ? 1 : 0
    userMap[p.user_id].predictions  += 1
  })

  const userIds = Object.keys(userMap)
  if (!userIds.length) return NextResponse.json({ data: [], total_fixtures: fixtureIds.length })

  // Fetch display names
  const { data: users } = await (admin.from('users') as any)
    .select('id, display_name')
    .in('id', userIds)

  const userNameMap: Record<string, string> = {}
  ;(users ?? []).forEach((u: any) => { userNameMap[u.id] = u.display_name ?? 'Unknown' })

  const ranked = Object.entries(userMap)
    .map(([userId, stats]) => ({
      user_id:       userId,
      display_name:  userNameMap[userId] ?? 'Unknown',
      total_points:  stats.total_points,
      correct_count: stats.correct,
      predictions:   stats.predictions,
    }))
    .sort((a, b) => b.total_points - a.total_points || b.correct_count - a.correct_count)
    .map((row, i) => ({ ...row, rank: i + 1 }))

  return NextResponse.json({ data: ranked, total_fixtures: fixtureIds.length })
}
