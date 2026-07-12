// Recompute-and-store challenge finishing ranks. Reuses the EXACT scoring the live leaderboard
// routes use (rankMatchEntries / scoreBracket + buildActualWinners), so a stored rank always
// equals what the leaderboard shows — no duplicated/divergent logic. Writes final_rank,
// final_points, field_size, ranked_at onto match_entries / bracket_entries (migration 168).
// Run nightly via /api/cron/challenge-ranks; match ranks are only stored once the fixture is
// settled, bracket ranks once knockout results begin (and refresh as later rounds resolve).

import { rankMatchEntries, isSettled, type MatchFixtureResult } from '@/lib/match/score'
import { scoreBracket, buildActualWinners, type KnockoutFixture } from '@/lib/bracket-scoring'

const KO_ROUNDS = ['r32', 'r16', 'qf', 'sf', 'tp', 'f']
const absDiff = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? Infinity : Math.abs(a - b)

// Apply computed ranks to entry rows (per-row update by id; challenges are small).
async function writeRanks(admin: any, table: string, ranked: { id: string; rank: number; points: number }[], fieldSize: number) {
  const at = new Date().toISOString()
  await Promise.all(ranked.map(r =>
    (admin.from(table) as any).update({ final_rank: r.rank, final_points: r.points, field_size: fieldSize, ranked_at: at }).eq('id', r.id)))
  return ranked.length
}

async function rankMatchChallenge(admin: any, ch: any): Promise<number> {
  if (!ch.fixture_id) return 0
  const { data: fx } = await (admin.from('fixtures') as any)
    .select('home, away, home_score, away_score, pen_winner, first_goal_min').eq('id', ch.fixture_id).maybeSingle()
  const f: MatchFixtureResult = { home: fx?.home, away: fx?.away, home_score: fx?.home_score ?? null, away_score: fx?.away_score ?? null, pen_winner: fx?.pen_winner ?? null, first_goal_min: fx?.first_goal_min ?? null }
  if (!fx || !isSettled(f)) return 0   // only store a final rank once the match is decided

  const { data: entries } = await (admin.from('match_entries') as any)
    .select('id, user_id, pred_home, pred_away, advances_team, first_goal_min, entered_at').eq('challenge_id', ch.id)
  if (!entries || entries.length === 0) return 0

  const ranked = rankMatchEntries(entries as any[], f)
  const rows = ranked.map((e: any, i: number) => ({ id: e.id, rank: i + 1, points: e.score.points }))
  return writeRanks(admin, 'match_entries', rows, rows.length)
}

async function rankBracketChallenge(admin: any, ch: any): Promise<number> {
  const tid = ch.tournament_id
  const { data: fixtures } = await (admin.from('fixtures') as any)
    .select('round, kickoff_utc, home, away, home_score, away_score, pen_winner, bracket_slot')
    .eq('tournament_id', tid).in('round', KO_ROUNDS)
  const actual = buildActualWinners((fixtures ?? []) as KnockoutFixture[])
  if (Object.keys(actual).length === 0) return 0   // knockout results haven't begun

  // Final / 3rd-place goal totals for the tie-breaks (inert until those matches are played).
  const goalTotal = (r: string) => {
    const g = (fixtures ?? []).find((x: any) => x.round === r)
    return g && g.home_score != null && g.away_score != null ? g.home_score + g.away_score : null
  }
  const finalGoals = goalTotal('f'), tpGoals = goalTotal('tp')

  const { data: entries } = await (admin.from('bracket_entries') as any)
    .select('id, user_id, final_goals, tp_goals, entered_at').eq('challenge_id', ch.id)
  if (!entries || entries.length === 0) return 0

  // Each entrant's picks (slot_key → team) for this tournament.
  const userIds = (entries as any[]).map(e => e.user_id)
  const byUser: Record<string, Record<string, string>> = {}
  for (let i = 0; i < userIds.length; i += 200) {
    const batch = userIds.slice(i, i + 200)
    const { data: picks } = await (admin.from('bracket_picks') as any)
      .select('user_id, slot_key, team_name').eq('tournament_id', tid).in('user_id', batch)
    for (const p of ((picks ?? []) as any[])) (byUser[p.user_id] ??= {})[p.slot_key] = p.team_name
  }

  const scored = (entries as any[]).map(e => ({
    id: e.id,
    total: scoreBracket(byUser[e.user_id] ?? {}, actual).total,
    _tbFinal: absDiff(e.final_goals, finalGoals),
    _tbTp: absDiff(e.tp_goals, tpGoals),
    _entered: e.entered_at,
  }))
  scored.sort((a, b) =>
    b.total - a.total ||
    a._tbFinal - b._tbFinal ||
    a._tbTp - b._tbTp ||
    String(a._entered).localeCompare(String(b._entered)))
  const rows = scored.map((e, i) => ({ id: e.id, rank: i + 1, points: e.total }))
  return writeRanks(admin, 'bracket_entries', rows, rows.length)
}

// Targeted refresh after a single fixture's result settles — cheaper than the full nightly
// sweep. Ranks the match challenge on this fixture, and (when a knockout result lands) the
// tournament's bracket challenges, whose standings just changed.
export async function refreshChallengeRanksForFixture(
  admin: any, opts: { fixtureId: number; tournamentId?: string | null; round?: string | null },
) {
  let entriesWritten = 0
  const { data: matchChs } = await (admin.from('challenges') as any)
    .select('id, tournament_id, type, fixture_id, enabled').eq('enabled', true).eq('type', 'match').eq('fixture_id', opts.fixtureId)
  for (const ch of ((matchChs ?? []) as any[])) { try { entriesWritten += await rankMatchChallenge(admin, ch) } catch { /* skip */ } }

  if (opts.tournamentId && opts.round && KO_ROUNDS.includes(opts.round)) {
    const { data: brkChs } = await (admin.from('challenges') as any)
      .select('id, tournament_id, type, fixture_id, enabled').eq('enabled', true).eq('type', 'bracket').eq('tournament_id', opts.tournamentId)
    for (const ch of ((brkChs ?? []) as any[])) { try { entriesWritten += await rankBracketChallenge(admin, ch) } catch { /* skip */ } }
  }
  return { entriesWritten }
}

export async function refreshAllChallengeRanks(admin: any) {
  const { data: challenges } = await (admin.from('challenges') as any)
    .select('id, tournament_id, type, fixture_id, enabled').eq('enabled', true).in('type', ['match', 'bracket'])

  let matchChallenges = 0, bracketChallenges = 0, entriesWritten = 0
  for (const ch of ((challenges ?? []) as any[])) {
    try {
      if (ch.type === 'match')   { entriesWritten += await rankMatchChallenge(admin, ch);   matchChallenges++ }
      if (ch.type === 'bracket') { entriesWritten += await rankBracketChallenge(admin, ch); bracketChallenges++ }
    } catch { /* one bad challenge shouldn't sink the batch */ }
  }
  return { challenges: (challenges ?? []).length, matchChallenges, bracketChallenges, entriesWritten }
}
