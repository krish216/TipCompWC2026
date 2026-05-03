import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/challenge-rank?score=0-4
// Public — no auth required.
// Returns real WUP leaderboard context for the warm-up challenge result screen:
//   total:    total number of WUP participants with at least 1 point
//   leaders:  top 5 display names + WUP points (for projected leaderboard)
//   rank:     projected rank for the given score (0-4 correct picks)
export async function GET(request: NextRequest) {
  const admin = createAdminClient()
  const score = Math.min(4, Math.max(0, Number(request.nextUrl.searchParams.get('score') ?? 0)))

  // Resolve active tournament
  const { data: tournRows } = await (admin.from('tournaments') as any)
    .select('id').eq('is_active', true).order('start_date', { ascending: true }).limit(1)
  const tournamentId: string | undefined = (tournRows as any)?.[0]?.id
  if (!tournamentId) {
    return NextResponse.json({ total: 0, leaders: [], rank: 1 },
      { headers: { 'Cache-Control': 'no-store' } })
  }

  // Get WUP fixture IDs
  const { data: wupFx } = await (admin.from('fixtures') as any)
    .select('id').eq('tournament_id', tournamentId).eq('round', 'wup')
  const wupIds: number[] = (wupFx ?? []).map((f: any) => f.id)
  if (!wupIds.length) {
    return NextResponse.json({ total: 0, leaders: [], rank: 1 },
      { headers: { 'Cache-Control': 'no-store' } })
  }

  // Aggregate WUP points per user
  const { data: predRows } = await (admin.from('predictions') as any)
    .select('user_id, points_earned')
    .in('fixture_id', wupIds)
    .not('points_earned', 'is', null)
    .gt('points_earned', 0)

  const userPts: Record<string, number> = {}
  ;(predRows ?? []).forEach((p: any) => {
    userPts[p.user_id] = (userPts[p.user_id] ?? 0) + Number(p.points_earned)
  })

  const sorted = Object.entries(userPts).sort(([, a], [, b]) => b - a)
  const total  = sorted.length

  // Fetch display names for top 5
  const top5Ids  = sorted.slice(0, 5).map(([uid]) => uid)
  const leaders: { name: string; points: number }[] = []
  if (top5Ids.length) {
    const { data: userRows } = await (admin.from('users') as any)
      .select('id, display_name').in('id', top5Ids)
    const nameMap: Record<string, string> = {}
    ;(userRows ?? []).forEach((u: any) => { nameMap[u.id] = u.display_name })
    sorted.slice(0, 5).forEach(([uid, pts]) => {
      if (nameMap[uid]) leaders.push({ name: nameMap[uid], points: pts })
    })
  }

  // Estimated max WUP points (from top scorer) — used to map score 0-4 to a point bucket
  const maxPts = sorted[0]?.[1] ?? 1
  // A perfect score (4/4) maps to ~maxPts; scale linearly
  const estimatedPts = Math.round((score / 4) * maxPts)
  // Count how many real users scored strictly higher
  const ahead = sorted.filter(([, pts]) => pts > estimatedPts).length
  const rank  = Math.max(1, ahead + 1)

  return NextResponse.json(
    { total, leaders, rank },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
