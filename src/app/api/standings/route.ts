import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { getTournamentBySlug, getTeamsAndFixtures } from '@/lib/content/wc'
import { leagueTable } from '@/lib/standings/predictor'
import { tipsterFlag } from '@/lib/geo-flag'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/standings?tournament=<slug>
// The quartered Top-N/Bottom-N predictor for a tournament: the quarters (with state),
// the teams to pick from, the signed-in user's picks, actual buckets for settled
// quarters, and a season-long aggregate leaderboard.
export async function GET(request: NextRequest) {
  const slug = new URL(request.url).searchParams.get('tournament') || ''
  const admin = createAdminClient()
  const t = await getTournamentBySlug(slug)
  if (!t) return NextResponse.json({ error: 'tournament not found' }, { status: 404 })

  const [{ data: qs }, { teams, fixtures }, { data: tRow }] = await Promise.all([
    (admin.from('standings_quarters') as any).select('*').eq('tournament_id', t.id).order('quarter'),
    getTeamsAndFixtures(t.id),
    (admin.from('tournaments') as any).select('enrollment_open').eq('id', t.id).maybeSingle(),
  ])
  const quarters = (qs ?? []) as any[]
  const enrollmentOpen = (tRow as any)?.enrollment_open !== false

  const user = await getSessionUser().catch(() => null)
  const { data: preds } = await (admin.from('standings_predictions') as any)
    .select('quarter, user_id, top_teams, bottom_teams, points').eq('tournament_id', t.id)
  const rows = (preds ?? []) as any[]
  const mine = user ? rows.filter(r => r.user_id === user.id) : []

  const now = Date.now()
  const quartersOut = quarters.map(q => {
    const settled = !!q.settled_at
    const locked  = now >= new Date(q.locks_at).getTime()
    const my = mine.find(r => r.quarter === q.quarter) ?? null
    let actual_top: string[] = [], actual_bottom: string[] = []
    if (settled) {
      const table = leagueTable(teams, fixtures, q.checkpoint_round)
      actual_top    = table.slice(0, q.top_n).map(r => r.team)
      actual_bottom = table.slice(-q.bottom_n).map(r => r.team)
    }
    return {
      quarter: q.quarter, label: q.label, checkpoint_round: q.checkpoint_round,
      checkpoint_games: q.checkpoint_games, locks_at: q.locks_at,
      top_n: q.top_n, bottom_n: q.bottom_n, points_per_correct: q.points_per_correct,
      state: settled ? 'settled' : locked ? 'locked' : 'open',
      entrants: rows.filter(r => r.quarter === q.quarter).length,
      my: my ? { top_teams: my.top_teams, bottom_teams: my.bottom_teams, points: my.points } : null,
      ...(settled ? { actual_top, actual_bottom } : {}),
    }
  })

  // Aggregate leaderboard across settled quarters.
  const totals = new Map<string, number>()
  for (const r of rows) if (r.points != null) totals.set(r.user_id, (totals.get(r.user_id) ?? 0) + r.points)
  let leaderboard: any[] = []
  if (totals.size) {
    const ids = [...totals.keys()]
    const { data: us } = await (admin.from('users') as any).select('id, display_name, first_name, country, timezone').in('id', ids)
    leaderboard = (us ?? []).map((u: any) => ({
      name: u.display_name || u.first_name || 'Anonymous',
      flag: tipsterFlag(u.country, u.timezone),
      total_points: totals.get(u.id) ?? 0,
      is_me: !!(user && u.id === user.id),
    })).sort((a: any, b: any) => b.total_points - a.total_points)
  }

  return NextResponse.json({
    tournament: { slug: t.slug, name: t.name },
    enrollment_open: enrollmentOpen,
    teams: teams.map(tm => ({ name: tm.name, code: tm.code, logo: tm.logo, flag: tm.flag })),
    quarters: quartersOut,
    leaderboard,
    logged_in: !!user,
  })
}
