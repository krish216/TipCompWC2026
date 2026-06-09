import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import {
  apiFootballFixtures, apiFootballConfigured, FINISHED_STATUSES, canonTeam, isPlaceholderTeam,
  notifyScoreUpdate, settleChallengesForFixture,
} from '@/lib/match-results'

export const dynamic = 'force-dynamic'

// Triggered by a scheduler (Supabase pg_cron via pg_net) every few minutes during
// the tournament. Auth via CRON_SECRET bearer token. Fetches results from
// API-Football by the stored api_fixture_id (see migration 112 + /api/admin/map-fixtures),
// so there is no fragile team-name matching and no narrow time window.

const TOURNAMENT_START = new Date('2026-06-11T00:00:00Z')
const TOURNAMENT_END   = new Date('2026-07-21T00:00:00Z')

// API-Football allows up to 20 fixture ids per `ids=` request.
const ID_BATCH = 20
// Cap fixtures processed per run so a backlog can't blow the 30s function budget.
const MAX_PER_RUN = 15

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!apiFootballConfigured()) {
    return NextResponse.json({ error: 'No API-Football key configured (set API_SPORTS_KEY or API_FOOTBALL_KEY)' }, { status: 500 })
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

  // One batched lookup by id (chunked) — not one call per fixture.
  const apiById = new Map<number, any>()
  const ids: number[] = pending.map((f: any) => f.api_fixture_id)
  try {
    for (let i = 0; i < ids.length; i += ID_BATCH) {
      const chunk = ids.slice(i, i + ID_BATCH)
      const rows = await apiFootballFixtures(`ids=${chunk.join('-')}`)
      for (const item of rows) apiById.set(item.fixture?.id, item)
    }
  } catch (err: any) {
    return NextResponse.json({ error: `API-Football fetch failed: ${err.message}` }, { status: 502 })
  }

  let updated = 0
  const skipped: { fixture_id: number; reason: string }[] = []

  for (const f of pending as any[]) {
    const item = apiById.get(f.api_fixture_id)
    if (!item) { skipped.push({ fixture_id: f.id, reason: 'not in API response' }); continue }

    const status = item.fixture?.status?.short
    if (!FINISHED_STATUSES.has(status)) continue   // not finished yet — try again next run

    let homeScore = item.goals?.home
    let awayScore = item.goals?.away
    if (homeScore == null || awayScore == null) {
      skipped.push({ fixture_id: f.id, reason: `no goals (status ${status})` }); continue
    }

    // Map API home/away onto OUR home/away by team identity (guards against a
    // reversed home/away designation). Trust orientation only for placeholder teams.
    const apiHome = canonTeam(item.teams?.home?.name)
    const apiAway = canonTeam(item.teams?.away?.name)
    const ourHome = canonTeam(f.home)
    const ourAway = canonTeam(f.away)
    let swapped = false
    if (!isPlaceholderTeam(f.home) && !isPlaceholderTeam(f.away)) {
      if (ourHome === apiHome && ourAway === apiAway) {
        swapped = false
      } else if (ourHome === apiAway && ourAway === apiHome) {
        swapped = true
        ;[homeScore, awayScore] = [awayScore, homeScore]
      } else {
        skipped.push({ fixture_id: f.id, reason: 'team mismatch — not written' }); continue
      }
    }

    // Penalty shootout winner → our team name.
    let penWinner: string | null = null
    if (status === 'PEN') {
      const winnerCanon = item.teams?.home?.winner ? apiHome
        : item.teams?.away?.winner ? apiAway : null
      penWinner = winnerCanon === ourHome ? f.home
        : winnerCanon === ourAway ? f.away
        : (item.teams?.home?.winner ? (swapped ? f.away : f.home) : (swapped ? f.home : f.away))
    }

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
