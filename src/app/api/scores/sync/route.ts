import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import {
  espnScoreboard, parseEspnEvent, canonTeam, isPlaceholderTeam,
  notifyScoreUpdate, settleChallengesForFixture,
} from '@/lib/match-results'
import { refreshKnockoutSchedule } from '@/lib/bracket/schedule-sync'
import { sendDueAutoReminders } from '@/lib/comp-auto-reminders'
import { autoPostRoundDebriefs } from '@/lib/round-debrief-auto'

export const dynamic = 'force-dynamic'

// Triggered by Supabase pg_cron every 5 min, year-round. Auth via CRON_SECRET. Pulls
// results from ESPN's free scoreboard API — one feed per tournament, via
// tournaments.espn_league (migration 149) — and matches them to our fixtures by team
// pair + date (no stored id / mapping step needed). Manual admin entries are never
// touched (guarded on home_score IS NULL). No date window: the pending-fixtures query
// below already returns nothing when no tournament has a kicked-off, unscored game, so
// a fixed tournament window isn't needed and would just have to be re-tuned per season.

const MAX_PER_RUN = 20
const DAY = 86_400_000
const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const supabase = createAdminClient()

  // Refresh knockout teams/dates/venues from ESPN (event-id keyed). Must run before
  // results so name-matching uses current teams. Best-effort.
  let schedule = { updated: 0, checked: 0 }
  try { schedule = await refreshKnockoutSchedule(supabase) }
  catch (e: any) { console.error('[scores/sync] schedule refresh failed:', e?.message ?? e) }

  // ── RESULTS FIRST ───────────────────────────────────────────────────────────
  // The time-critical work runs BEFORE the heavy best-effort steps below. This
  // endpoint is called by a 30s-timeout cron; the debrief/reminder/pick-stats work
  // can exceed that when a round completes, so scoring must commit first (each
  // fixture UPDATE autocommits) — a later timeout can't undo results already written.
  let updated = 0
  let liveUpdated = 0
  let checked = 0
  const skipped: { fixture_id: number; reason: string }[] = []
  try {
    const { data: pending, error: pendErr } = await (supabase.from('fixtures') as any)
      .select('id, home, away, kickoff_utc, tournament_id')
      .neq('round', 'wup')
      .is('home_score', null)
      .lte('kickoff_utc', now.toISOString())
      .order('kickoff_utc', { ascending: true })
      .limit(MAX_PER_RUN)
    if (pendErr) throw new Error(pendErr.message)
    checked = pending?.length ?? 0

    if (checked > 0) {
      // Group by tournament — each has its own ESPN feed (tournaments.espn_league,
      // e.g. 'fifa.world' for the WC, 'eng.1' for the EPL) so a WC fixture is never
      // looked up against the EPL scoreboard or vice versa.
      const tournamentIds = [...new Set((pending as any[]).map(f => f.tournament_id).filter(Boolean))]
      const { data: tournaments } = await (supabase.from('tournaments') as any)
        .select('id, slug, espn_league')
        .in('id', tournamentIds)
      const leagueByTournament = new Map<number, string | null>(
        (tournaments ?? []).map((t: any) => [t.id, t.espn_league])
      )

      const byTournament = new Map<number, any[]>()
      for (const f of pending as any[]) {
        if (!byTournament.has(f.tournament_id)) byTournament.set(f.tournament_id, [])
        byTournament.get(f.tournament_id)!.push(f)
      }

      for (const [tournamentId, fixtures] of byTournament) {
        const league = leagueByTournament.get(tournamentId)
        if (!league) {
          for (const f of fixtures) skipped.push({ fixture_id: f.id, reason: 'tournament has no espn_league configured' })
          continue
        }

        // One ESPN call covers a date range spanning this tournament's pending kickoffs (± a day).
        const times = fixtures.map((f: any) => new Date(f.kickoff_utc).getTime())
        const dates = `${yyyymmdd(new Date(Math.min(...times) - DAY))}-${yyyymmdd(new Date(Math.max(...times) + DAY))}`
        const byPair = new Map<string, ReturnType<typeof parseEspnEvent>>()
        for (const ev of await espnScoreboard(dates, league)) {
          const p = parseEspnEvent(ev)
          if (!p || p.comps.length !== 2) continue
          byPair.set([p.comps[0].canon, p.comps[1].canon].sort().join('|'), p)
        }

        for (const f of fixtures) {
          if (isPlaceholderTeam(f.home) || isPlaceholderTeam(f.away)) continue   // TBD knockout — can't name-match yet

          const ourHome = canonTeam(f.home), ourAway = canonTeam(f.away)
          const ev = byPair.get([ourHome, ourAway].sort().join('|'))
          if (!ev) { skipped.push({ fixture_id: f.id, reason: 'not found on ESPN (date/name)' }); continue }

          // Still in progress — capture the LIVE scoreline into the SEPARATE live_*
          // columns (never home_score, which would fire final scoring) so the match
          // challenge board can show a provisional "if it ended now" ranking. Then
          // retry the final result next run.
          if (!ev.completed) {
            if (ev.state === 'in') {
              const lh = ev.comps.find(c => c.canon === ourHome)?.score ?? null
              const la = ev.comps.find(c => c.canon === ourAway)?.score ?? null
              if (lh != null && la != null) {
                await (supabase.from('fixtures') as any).update({
                  live_home_score: lh, live_away_score: la, live_status: 'in',
                  live_minute: ev.minute, live_updated_at: new Date().toISOString(),
                  // Actual first-goal minute once the first goal is scored — powers the
                  // provisional tie-break live; only set when known (never overwrite with null).
                  ...(ev.firstGoalMinute != null ? { first_goal_min: ev.firstGoalMinute } : {}),
                }).eq('id', f.id).is('home_score', null)
                liveUpdated++
              }
            }
            continue
          }

          const homeComp = ev.comps.find(c => c.canon === ourHome)
          const awayComp = ev.comps.find(c => c.canon === ourAway)
          if (!homeComp || !awayComp || homeComp.score == null || awayComp.score == null) {
            skipped.push({ fixture_id: f.id, reason: 'completed but no score' }); continue
          }

          // Penalty shootout winner → our team name (level score above stays a draw).
          let penWinner: string | null = null
          if (ev.isShootout) {
            const w = ev.comps.find(c => c.winner)
            penWinner = w?.canon === ourHome ? f.home : w?.canon === ourAway ? f.away : null
          }

          const { data: upd, error } = await (supabase.from('fixtures') as any)
            .update({
              home_score: homeComp.score,
              away_score: awayComp.score,
              pen_winner: penWinner,
              result_set_at: new Date().toISOString(),
              result_set_by: null, // null = automated
              live_status: 'ft',    // final is in — stop the live/provisional board
              // Actual first-goal minute for the tie-break: ESPN's if known, else 0 for a
              // goalless match (0–0 = "no goal"); leave unset if goals but no play detail.
              ...(ev.firstGoalMinute != null
                ? { first_goal_min: ev.firstGoalMinute }
                : ((homeComp.score ?? 0) + (awayComp.score ?? 0) === 0 ? { first_goal_min: 0 } : {})),
            })
            .eq('id', f.id)
            .is('home_score', null)   // never clobber a manual entry
            .select('id')

          if (error) { skipped.push({ fixture_id: f.id, reason: error.message }); continue }
          if (!upd?.length) { skipped.push({ fixture_id: f.id, reason: 'already had a result' }); continue }

          updated++
          console.log(`[scores/sync] fixture ${f.id}: ${f.home} ${homeComp.score}-${awayComp.score} ${f.away}${penWinner ? ` (pens: ${penWinner})` : ''}`)
          await notifyScoreUpdate(supabase, f.id)
          await settleChallengesForFixture(supabase, f.id).catch(() => {})
        }
      }
    }
  } catch (e: any) { console.error('[scores/sync] results failed:', e?.message ?? e) }

  // ── BEST-EFFORT SIDE-EFFECTS (LAST) ─────────────────────────────────────────
  // Heavy when a round completes (auto-reminders email untipped members; the
  // pick-stats view refresh; debrief posting to every tribe). Run after results so a
  // timeout here can never block scoring.
  let reminders = { comps: 0, emails: 0 }
  try { reminders = await sendDueAutoReminders(supabase) }
  catch (e: any) { console.error('[scores/sync] auto-reminders failed:', e?.message ?? e) }

  try { await (supabase.rpc as any)('refresh_fixture_pick_stats') }
  catch (e: any) { console.error('[scores/sync] pick-stats refresh failed:', e?.message ?? e) }

  let debriefs = { rounds: [] as string[], posted: 0, notified: 0 }
  try { debriefs = await autoPostRoundDebriefs(supabase) }
  catch (e: any) { console.error('[scores/sync] auto-debrief failed:', e?.message ?? e) }

  return NextResponse.json({ updated, liveUpdated, checked, schedule, reminders, debriefs, skipped, source: 'espn', timestamp: now.toISOString() })
}
