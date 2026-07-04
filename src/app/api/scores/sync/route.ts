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

// Triggered by Supabase pg_cron every 5 min during the tournament. Auth via
// CRON_SECRET. Pulls results from ESPN's free scoreboard API and matches them to
// our fixtures by team pair + date (no stored id / mapping step needed). Manual
// admin entries are never touched (guarded on home_score IS NULL).

const TOURNAMENT_START = new Date('2026-06-11T00:00:00Z')
const TOURNAMENT_END   = new Date('2026-07-21T00:00:00Z')
const MAX_PER_RUN = 20
const DAY = 86_400_000
const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  if (now < TOURNAMENT_START || now > TOURNAMENT_END) {
    return NextResponse.json({ skipped: 'Outside tournament window' })
  }

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
  let checked = 0
  const skipped: { fixture_id: number; reason: string }[] = []
  try {
    const { data: pending, error: pendErr } = await (supabase.from('fixtures') as any)
      .select('id, home, away, kickoff_utc')
      .neq('round', 'wup')
      .is('home_score', null)
      .lte('kickoff_utc', now.toISOString())
      .order('kickoff_utc', { ascending: true })
      .limit(MAX_PER_RUN)
    if (pendErr) throw new Error(pendErr.message)
    checked = pending?.length ?? 0

    if (checked > 0) {
      // One ESPN call covers a date range spanning the pending kickoffs (± a day).
      const times = pending.map((f: any) => new Date(f.kickoff_utc).getTime())
      const dates = `${yyyymmdd(new Date(Math.min(...times) - DAY))}-${yyyymmdd(new Date(Math.max(...times) + DAY))}`
      const byPair = new Map<string, ReturnType<typeof parseEspnEvent>>()
      for (const ev of await espnScoreboard(dates)) {
        const p = parseEspnEvent(ev)
        if (!p || p.comps.length !== 2) continue
        byPair.set([p.comps[0].canon, p.comps[1].canon].sort().join('|'), p)
      }

      for (const f of pending as any[]) {
        if (isPlaceholderTeam(f.home) || isPlaceholderTeam(f.away)) continue   // TBD knockout — can't name-match yet

        const ourHome = canonTeam(f.home), ourAway = canonTeam(f.away)
        const ev = byPair.get([ourHome, ourAway].sort().join('|'))
        if (!ev) { skipped.push({ fixture_id: f.id, reason: 'not found on ESPN (date/name)' }); continue }
        if (!ev.completed) continue   // still in progress — retry next run

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

  return NextResponse.json({ updated, checked, schedule, reminders, debriefs, skipped, source: 'espn', timestamp: now.toISOString() })
}
