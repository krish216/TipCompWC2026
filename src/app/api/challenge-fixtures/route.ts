import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/challenge-fixtures
// Public — no auth required.
// Returns the first 4 fixtures in round 'wup' for the active tournament,
// with team flag emojis and live consensus percentages computed from
// the predictions table.  Falls back to null pct values when fewer
// than MIN_PREDICTIONS predictions exist (caller uses hardcoded defaults).
const MIN_PREDICTIONS = 10

export async function GET() {
  const admin = createAdminClient()

  // Resolve active tournament
  const { data: tournRows } = await (admin.from('tournaments') as any)
    .select('id').eq('is_active', true).order('start_date', { ascending: true }).limit(1)
  const tournamentId: string | undefined = (tournRows as any)?.[0]?.id
  if (!tournamentId) return NextResponse.json({ data: [], tournament_id: null })

  // Fetch first 4 wup fixtures ordered by kickoff
  const { data: fxRows, error: fxErr } = await (admin.from('fixtures') as any)
    .select('id, home, away, kickoff_utc, venue, grp')
    .eq('tournament_id', tournamentId)
    .eq('round', 'wup')
    .order('kickoff_utc', { ascending: true })
    .limit(4)

  if (fxErr || !(fxRows as any)?.length) {
    return NextResponse.json({ data: [], tournament_id: tournamentId })
  }

  const fixtures = fxRows as any[]
  const fixtureIds: number[] = fixtures.map((f: any) => f.id)

  // Fetch team flag emojis from tournament_teams
  const allTeams: string[] = [...new Set(fixtures.flatMap((f: any) => [f.home, f.away]))]
  const { data: teamRows } = await (admin.from('tournament_teams') as any)
    .select('name, flag_emoji')
    .eq('tournament_id', tournamentId)
    .in('name', allTeams)
  const flagMap: Record<string, string> = {}
  ;(teamRows as any[] ?? []).forEach((t: any) => { flagMap[t.name] = t.flag_emoji ?? '🏳️' })

  // Aggregate live consensus from predictions table
  const { data: predRows } = await (admin.from('predictions') as any)
    .select('fixture_id, outcome')
    .in('fixture_id', fixtureIds)
    .not('outcome', 'is', null)

  const consensusMap: Record<number, { H: number; D: number; A: number; total: number }> = {}
  ;(predRows as any[] ?? []).forEach((p: any) => {
    if (!consensusMap[p.fixture_id]) consensusMap[p.fixture_id] = { H: 0, D: 0, A: 0, total: 0 }
    if (p.outcome === 'H' || p.outcome === 'D' || p.outcome === 'A') {
      consensusMap[p.fixture_id][p.outcome as 'H' | 'D' | 'A']++
      consensusMap[p.fixture_id].total++
    }
  })

  const data = fixtures.map((f: any) => {
    const c = consensusMap[f.id]
    const total = c?.total ?? 0
    const hasEnough = total >= MIN_PREDICTIONS
    return {
      id:               f.id,
      home:             f.home,
      away:             f.away,
      home_flag:        flagMap[f.home]  ?? '🏳️',
      away_flag:        flagMap[f.away]  ?? '🏳️',
      kickoff_utc:      f.kickoff_utc,
      venue:            f.venue,
      group:            f.grp,
      pct_home:         hasEnough ? Math.round((c.H / total) * 100) : null,
      pct_draw:         hasEnough ? Math.round((c.D / total) * 100) : null,
      pct_away:         hasEnough ? Math.round((c.A / total) * 100) : null,
      prediction_count: total,
    }
  })

  return NextResponse.json({ data, tournament_id: tournamentId })
}
