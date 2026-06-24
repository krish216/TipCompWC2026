import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { resolveBracketChallenge } from '@/lib/bracket/challenge'
import { buildActualWinners, buildSlotResults, scoreBracket, BRACKET_MAX, BRACKET_SLOT_POINTS, SCORED_SLOTS, type KnockoutFixture, type SlotResult } from '@/lib/bracket-scoring'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'   // live results — never serve a cached fetch

// GET /api/bracket/leaderboard?challenge=<slug> — a single bracket challenge's
// leaderboard. The pool is that challenge's *entrants* (a bracket_entries row),
// ranked by score on their shared tournament bracket, tie-broken by the goal
// predictions captured at entry. No ?challenge → the tournament's default
// bracket challenge (keeps the legacy slug-less URL working). The signed-in
// user's own row is returned as `me` (only if they entered this challenge).
export async function GET(request: NextRequest) {
  const admin = createAdminClient()
  const user  = await getSessionUser().catch(() => null)

  const slug = new URL(request.url).searchParams.get('challenge')
  const challenge = await resolveBracketChallenge(admin, { slug })
  if (!challenge) {
    return NextResponse.json({ entries: [], total_entrants: 0, me: null, max: BRACKET_MAX, scoring_started: false, challenge: null })
  }
  const tournamentId = challenge.tournament_id

  // Simulation overlay: when bracket_sim_mode is ON, score against simulated
  // winners (bracket_sim_results) instead of live fixtures — the main prediction
  // game is never touched. Otherwise, derive winners from real knockout results.
  const { data: simModeRow } = await (admin.from('app_settings') as any).select('value').eq('key', 'bracket_sim_mode').maybeSingle()
  const simulated = (simModeRow as any)?.value === 'on'

  let actual: Record<string, string> = {}
  let slotResults: Record<string, SlotResult> = {}
  let finalGoals: number | null = null   // actual goal totals for the tie-break (live mode only)
  let tpGoals: number | null = null
  if (simulated) {
    const { data: sim } = await (admin.from('bracket_sim_results') as any).select('slot_key, team_name').eq('tournament_id', tournamentId)
    ;((sim ?? []) as any[]).forEach(r => {
      if (r.team_name) { actual[r.slot_key] = r.team_name; slotResults[r.slot_key] = { winner: r.team_name, loser: null, played: true } }
    })
  } else {
    const { data: fx } = await (admin.from('fixtures') as any)
      .select('round, kickoff_utc, home, away, home_score, away_score, pen_winner, bracket_slot')
      .eq('tournament_id', tournamentId).in('round', ['r32', 'r16', 'qf', 'sf', 'tp', 'f'])
    const fixtures = (fx ?? []) as KnockoutFixture[]
    actual = buildActualWinners(fixtures)
    slotResults = buildSlotResults(fixtures)
    // Goal totals (full-time/ET, excl. shootout — the score columns already strip
    // shootout goals) for the Final and 3rd-place match, when played.
    const goalsFor = (round: string) => {
      const f = fixtures.find(x => x.round === round)
      return f && f.home_score != null && f.away_score != null ? f.home_score + f.away_score : null
    }
    finalGoals = goalsFor('f')
    tpGoals    = goalsFor('tp')
  }
  const scoringStarted = Object.keys(actual).length > 0

  // Entrants = users who entered THIS challenge, with their tie-break goals.
  const entries: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await (admin.from('bracket_entries') as any)
      .select('user_id, final_goals, tp_goals, entered_at').eq('challenge_id', challenge.id).range(from, from + 999)
    if (!data?.length) break
    entries.push(...data)
    if (data.length < 1000) break
  }
  const entryByUser: Record<string, any> = {}
  for (const e of entries) entryByUser[e.user_id] = e
  const userIds = Object.keys(entryByUser)
  if (!userIds.length) {
    return NextResponse.json({
      entries: [], total_entrants: 0, me: null, max: BRACKET_MAX,
      scoring_started: scoringStarted, simulated, challenge: { slug: challenge.slug, name: challenge.name },
    })
  }

  // Those entrants' bracket picks (shared per tournament). Paged for safety.
  const rows: any[] = []
  for (let i = 0; i < userIds.length; i += 300) {
    const batch = userIds.slice(i, i + 300)
    const { data } = await (admin.from('bracket_picks') as any)
      .select('user_id, slot_key, team_name').eq('tournament_id', tournamentId).in('user_id', batch)
    if (data?.length) rows.push(...data)
  }
  const byUser: Record<string, Record<string, string | null>> = {}
  for (const r of rows) (byUser[r.user_id] ??= {})[r.slot_key] = r.team_name

  const { data: users } = await (admin.from('users') as any).select('id, display_name, avatar_url').in('id', userIds)
  const uMap = Object.fromEntries(((users ?? []) as any[]).map(u => [u.id, u]))

  const absDiff = (a: number | null | undefined, b: number | null) =>
    a == null || b == null ? Number.POSITIVE_INFINITY : Math.abs(a - b)

  let scored = userIds.map(uid => {
    const s = scoreBracket(byUser[uid] ?? {}, actual)
    const u = uMap[uid] ?? {}
    const e = entryByUser[uid]
    return {
      user_id:      uid,
      display_name: u.display_name ?? 'Unknown',
      avatar_url:   u.avatar_url ?? null,
      total:        s.total,
      by_round:     s.byRound,
      correct:      s.correct,
      // tie-break sort keys (lower = better); only meaningful once each match is played
      _tbFinal:     absDiff(e?.final_goals, finalGoals),
      _tbTp:        absDiff(e?.tp_goals, tpGoals),
      _entered:     e?.entered_at ?? '',
    }
  })
  // Rank: points → closeness of Final goal-total → closeness of 3rd-place
  // goal-total → earliest entry → name. The goal tie-breaks are inert until those
  // matches are played (absDiff = Infinity for both sides, so they compare equal).
  scored.sort((a, b) =>
    b.total - a.total ||
    a._tbFinal - b._tbFinal ||
    a._tbTp - b._tbTp ||
    String(a._entered).localeCompare(String(b._entered)) ||
    a.display_name.localeCompare(b.display_name))
  const ranked = scored.map(({ _tbFinal, _tbTp, _entered, ...e }, i) => ({ ...e, rank: i + 1 }))

  const me = user ? ranked.find(e => e.user_id === user.id) ?? null : null

  // Match-by-match scorecard for the signed-in entrant: per slot, their pick vs the
  // actual winner (and who that winner beat), so the UI can drill into each round.
  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase()
  let scorecard: any[] | null = null
  let champion: { team: string; status: 'in' | 'out' | 'won' } | null = null
  if (me) {
    const myPicks = byUser[user!.id] ?? {}
    scorecard = SCORED_SLOTS.map(({ slot, round }) => {
      const res  = slotResults[slot]
      const pick = myPicks[slot] ?? null
      const win  = res?.winner ?? null
      const correct = !!(win && pick && norm(win) === norm(pick))
      return {
        slot, round,
        pick,
        winner: win,
        loser:  res?.loser ?? null,
        played: !!res?.played,
        correct,
        points: correct ? BRACKET_SLOT_POINTS[round] : 0,
      }
    })

    const champTeam = myPicks['final'] ?? null
    if (champTeam) {
      // 'won' if they took the Final; 'out' if their champion lost a played match
      // (appears in slotResults but isn't that slot's winner); else 'in'.
      let status: 'in' | 'out' | 'won' = 'in'
      if (norm(actual['final']) === norm(champTeam)) status = 'won'
      else if (Object.values(slotResults).some(r => r.played && r.loser && norm(r.loser) === norm(champTeam))) status = 'out'
      champion = { team: champTeam, status }
    }
  }

  return NextResponse.json({
    entries:         ranked.slice(0, 12),   // top 12
    total_entrants:  ranked.length,
    me,                                     // caller's own row (incl. rank), even if outside top 12
    max:             BRACKET_MAX,
    scoring_started: scoringStarted,
    simulated,                              // true → results are an admin simulation, not live
    scorecard,                              // signed-in entrant's per-slot picks vs results
    champion,                               // their champion pick + live status
    challenge:       { slug: challenge.slug, name: challenge.name },
  })
}
