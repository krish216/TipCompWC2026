import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import {
  footballDataMatches, footballDataConfigured, FINISHED_STATUSES, canonTeam, isPlaceholderTeam,
  normaliseScore, notifyScoreUpdate, settleChallengesForFixture,
} from '@/lib/match-results'

export const dynamic = 'force-dynamic'

// Triggered by a scheduler (Supabase pg_cron via pg_net) every 15 min during the
// tournament. Auth via CRON_SECRET bearer token. Fetches the whole competition's
// matches from football-data.org in ONE call, then updates any mapped local fixture
// (by stored api_fixture_id = football-data match id) that has finished.

const TOURNAMENT_START = new Date('2026-06-11T00:00:00Z')
const TOURNAMENT_END   = new Date('2026-07-21T00:00:00Z')

// Cap fixtures processed per run so a backlog can't blow the 30s function budget.
const MAX_PER_RUN = 20

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!footballDataConfigured()) {
    return NextResponse.json({ error: 'FOOTBALL_DATA_TOKEN not configured' }, { status: 500 })
  }

  const now = new Date()
  if (now < TOURNAMENT_START || now > TOURNAMENT_END) {
    return NextResponse.json({ skipped: 'Outside tournament window' })
  }

  const supabase = createAdminClient()

  // Mapped fixtures that have kicked off but still have no result.
  const { data: pending, error: pendErr } = await (supabase.from('fixtures') as any)
    .select('id, home, away, api_fixture_id')
    .not('api_fixture_id', 'is', null)
    .is('home_score', null)
    .lte('kickoff_utc', now.toISOString())
    .order('kickoff_utc', { ascending: true })
    .limit(MAX_PER_RUN)

  if (pendErr) return NextResponse.json({ error: pendErr.message }, { status: 500 })
  if (!pending?.length) return NextResponse.json({ updated: 0, message: 'No pending mapped fixtures' })

  // One call returns every match in the competition; index by football-data match id.
  const matchById = new Map<number, any>()
  try {
    for (const m of await footballDataMatches()) matchById.set(m.id, m)
  } catch (err: any) {
    return NextResponse.json({ error: `football-data fetch failed: ${err.message}` }, { status: 502 })
  }

  let updated = 0
  const skipped: { fixture_id: number; reason: string }[] = []

  for (const f of pending as any[]) {
    const match = matchById.get(f.api_fixture_id)
    if (!match) { skipped.push({ fixture_id: f.id, reason: 'not in competition matches' }); continue }
    if (!FINISHED_STATUSES.has(match.status)) continue   // not finished yet — retry next run

    const ns = normaliseScore(match.score)
    if (!ns) { skipped.push({ fixture_id: f.id, reason: `no score (status ${match.status})` }); continue }

    let { home: homeScore, away: awayScore } = ns
    let winner = ns.winner   // 'HOME' | 'AWAY' | 'DRAW' | null, relative to football-data home/away

    // Map football-data home/away onto OUR home/away by team identity (guards against
    // a reversed designation). Trust orientation only for placeholder (TBD) teams.
    const fdHome = canonTeam(match.homeTeam?.name)
    const fdAway = canonTeam(match.awayTeam?.name)
    const ourHome = canonTeam(f.home)
    const ourAway = canonTeam(f.away)
    if (!isPlaceholderTeam(f.home) && !isPlaceholderTeam(f.away)) {
      if (ourHome === fdHome && ourAway === fdAway) {
        // aligned
      } else if (ourHome === fdAway && ourAway === fdHome) {
        ;[homeScore, awayScore] = [awayScore, homeScore]
        if (winner === 'HOME') winner = 'AWAY'
        else if (winner === 'AWAY') winner = 'HOME'
      } else {
        skipped.push({ fixture_id: f.id, reason: 'team mismatch — not written' }); continue
      }
    }

    // Penalty shootout winner → our team name (level score above is already a draw).
    const penWinner = ns.isShootout
      ? (winner === 'HOME' ? f.home : winner === 'AWAY' ? f.away : null)
      : null

    // Write — guard on home_score still null so we never clobber an admin entry.
    const { data: upd, error } = await (supabase.from('fixtures') as any)
      .update({
        home_score: homeScore,
        away_score: awayScore,
        pen_winner: penWinner,
        result_set_at: new Date().toISOString(),
        result_set_by: null, // null = automated
      })
      .eq('id', f.id)
      .is('home_score', null)
      .select('id')

    if (error) { skipped.push({ fixture_id: f.id, reason: error.message }); continue }
    if (!upd?.length) { skipped.push({ fixture_id: f.id, reason: 'already had a result' }); continue }

    updated++
    console.log(`[scores/sync] fixture ${f.id}: ${f.home} ${homeScore}-${awayScore} ${f.away}${penWinner ? ` (pens: ${penWinner})` : ''}`)

    // Same side effects as a manual admin entry (scoring itself is a DB trigger).
    await notifyScoreUpdate(supabase, f.id)
    await settleChallengesForFixture(supabase, f.id).catch(() => {})
  }

  return NextResponse.json({ updated, checked: pending.length, skipped, timestamp: now.toISOString() })
}
