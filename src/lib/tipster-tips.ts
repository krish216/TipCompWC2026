// Tipster Pro — "Tip Review" (the detail behind the summary). Round by round,
// fixture by fixture: how you tipped each game vs the Tournament, your Comp and your
// Tribe. Picks are OUTCOME-based (W/D/L) for all but sf/tp/f, so the comparison is an
// H/D/A split. Tournament split comes from the mock-excluded fixture_pick_stats MV;
// Comp/Tribe are aggregated live (real comps are tiny — see migration 129).

type Outcome = 'H' | 'D' | 'A'
const sign = (h: number, a: number): Outcome => (h > a ? 'H' : h < a ? 'A' : 'D')
const pickOf = (p: any): Outcome => (p.outcome as Outcome | null) ?? sign(p.home, p.away)

export interface PopSplit { h: number; d: number; a: number; total: number; samePct: number | null }
export interface TipReviewFixture {
  fixtureId: number
  home: string; away: string
  homeRank: number | null; awayRank: number | null
  homeScore: number | null; awayScore: number | null
  kickoffUtc: string
  result: Outcome | null
  myOutcome: Outcome | null
  myScore: { h: number; a: number } | null   // only set for score rounds (sf/tp/f)
  correct: boolean
  points: number
  isScoreRound: boolean
  tournament: PopSplit | null
  comp: PopSplit | null
  tribe: PopSplit | null
}
export interface TipReviewRound { code: string; name: string; label: string; order: number; fixtures: TipReviewFixture[] }
export interface TipReview { rounds: TipReviewRound[]; multiTribe: boolean }

// Page through a filtered predictions set (PostgREST caps at ~1000/req).
async function fetchPreds(admin: any, fixtureIds: number[], userIds: string[]): Promise<any[]> {
  if (!fixtureIds.length || !userIds.length) return []
  const out: any[] = []
  const PAGE = 1000
  for (let from = 0; from < 20000; from += PAGE) {
    const { data } = await (admin.from('predictions') as any)
      .select('fixture_id, outcome, home, away')
      .in('fixture_id', fixtureIds).in('user_id', userIds)
      .range(from, from + PAGE - 1)
    const rows = (data ?? []) as any[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

// Aggregate raw prediction rows into per-fixture H/D/A counts.
function aggregate(rows: any[]): Map<number, { h: number; d: number; a: number; total: number }> {
  const m = new Map<number, { h: number; d: number; a: number; total: number }>()
  for (const p of rows) {
    let e = m.get(p.fixture_id)
    if (!e) { e = { h: 0, d: 0, a: 0, total: 0 }; m.set(p.fixture_id, e) }
    const o = pickOf(p)
    if (o === 'H') e.h++; else if (o === 'A') e.a++; else e.d++
    e.total++
  }
  return m
}

const splitFor = (e: { h: number; d: number; a: number; total: number } | undefined, mine: Outcome | null): PopSplit | null => {
  if (!e || !e.total) return null
  const same = mine === 'H' ? e.h : mine === 'A' ? e.a : mine === 'D' ? e.d : 0
  return { h: e.h, d: e.d, a: e.a, total: e.total, samePct: mine ? Math.round((same / e.total) * 100) : null }
}

export async function computeTipReview(
  admin: any,
  userId: string,
  tournamentId: string,
  compId: string | null,
  tribeId: string | null,
): Promise<TipReview> {
  const [myPredsRes, fixturesRes, roundsRes, mockRes, tribesRes, teamsRes] = await Promise.all([
    (admin.from('predictions') as any)
      .select('fixture_id, outcome, home, away, points_earned, standard_points')
      .eq('user_id', userId).eq('tournament_id', tournamentId).not('points_earned', 'is', null),
    (admin.from('fixtures') as any)
      .select('id, home, away, home_score, away_score, round, kickoff_utc').eq('tournament_id', tournamentId),
    (admin.from('tournament_rounds') as any)
      .select('round_code, round_name, round_order, tab_label, predict_mode, include_in_scoring').eq('tournament_id', tournamentId),
    (admin.from('users') as any).select('id').like('email', 'mockuser%'),
    compId ? (admin.from('tribes') as any).select('id').eq('comp_id', compId) : Promise.resolve({ data: [] }),
    (admin.from('tournament_teams') as any).select('name, fifa_rank').eq('tournament_id', tournamentId),
  ])

  const roundMeta = new Map<string, any>()
  for (const r of (roundsRes.data ?? []) as any[]) roundMeta.set(r.round_code, r)
  const isScoreRound  = (code: string) => roundMeta.get(code)?.predict_mode === 'score'
  const isScoring     = (code: string) => roundMeta.get(code)?.include_in_scoring !== false

  const rankByTeam = new Map<string, number | null>()
  for (const t of (teamsRes.data ?? []) as any[]) rankByTeam.set(t.name, t.fifa_rank ?? null)

  const fixtureById = new Map<number, any>()
  for (const f of (fixturesRes.data ?? []) as any[]) fixtureById.set(f.id, f)

  // My settled tips in scoring rounds, with a result.
  const mine = ((myPredsRes.data ?? []) as any[])
    .map(p => ({ p, f: fixtureById.get(p.fixture_id) }))
    .filter(x => x.f && x.f.home_score != null && x.f.away_score != null && isScoring(x.f.round))
  const myFixtureIds = mine.map(x => x.f.id)

  const mockSet = new Set(((mockRes.data ?? []) as any[]).map(u => u.id))
  // The bar shows where the WHOLE group tipped — including you (your pick's segment
  // is then never empty, so the "your pick" outline always renders). Only the mock
  // seed accounts are excluded (they'd otherwise flatten the distribution).
  const realMembers = (ids: string[]) => ids.filter(id => !mockSet.has(id))

  // Comp & tribe member ids (mock excluded), then live aggregation.
  const [compMembersRes, tribeMembersRes, tournRows] = await Promise.all([
    compId ? (admin.from('user_comps') as any).select('user_id').eq('comp_id', compId) : Promise.resolve({ data: [] }),
    tribeId ? (admin.from('tribe_members') as any).select('user_id').eq('tribe_id', tribeId) : Promise.resolve({ data: [] }),
    myFixtureIds.length
      ? (admin.from('fixture_pick_stats') as any).select('fixture_id, h, d, a, total').in('fixture_id', myFixtureIds)
      : Promise.resolve({ data: [] }),
  ])

  const compIds  = realMembers(((compMembersRes.data  ?? []) as any[]).map(r => r.user_id))
  const tribeIds = realMembers(((tribeMembersRes.data ?? []) as any[]).map(r => r.user_id))
  const [compRows, tribeRows] = await Promise.all([
    fetchPreds(admin, myFixtureIds, compIds),
    fetchPreds(admin, myFixtureIds, tribeIds),
  ])

  const tournMap = new Map<number, any>()
  for (const r of (tournRows.data ?? []) as any[]) tournMap.set(r.fixture_id, r)
  const compMap  = aggregate(compRows)
  const tribeMap = aggregate(tribeRows)

  const multiTribe = ((tribesRes.data ?? []) as any[]).length > 1

  // Build fixtures, group by round.
  const byRound = new Map<string, TipReviewFixture[]>()
  for (const { p, f } of mine) {
    const myOutcome = pickOf(p)
    const result    = sign(f.home_score, f.away_score)
    const scoreRnd  = isScoreRound(f.round)
    const fixture: TipReviewFixture = {
      fixtureId: f.id, home: f.home, away: f.away,
      homeRank: rankByTeam.get(f.home) ?? null, awayRank: rankByTeam.get(f.away) ?? null,
      homeScore: f.home_score, awayScore: f.away_score, kickoffUtc: f.kickoff_utc, result,
      myOutcome, myScore: scoreRnd ? { h: p.home, a: p.away } : null,
      correct: (p.standard_points ?? 0) > 0, points: p.points_earned ?? 0, isScoreRound: scoreRnd,
      tournament: splitFor(tournMap.get(f.id), myOutcome),
      comp:  compId  ? splitFor(compMap.get(f.id),  myOutcome) : null,
      tribe: tribeId ? splitFor(tribeMap.get(f.id), myOutcome) : null,
    }
    if (!byRound.has(f.round)) byRound.set(f.round, [])
    byRound.get(f.round)!.push(fixture)
  }

  const rounds: TipReviewRound[] = [...byRound.entries()]
    .map(([code, fixtures]) => ({
      code,
      name: roundMeta.get(code)?.round_name ?? code.toUpperCase(),
      label: roundMeta.get(code)?.tab_label ?? roundMeta.get(code)?.round_name ?? code.toUpperCase(),
      order: roundMeta.get(code)?.round_order ?? 999,
      fixtures: fixtures.sort((a, b) =>
        new Date(fixtureById.get(a.fixtureId).kickoff_utc).getTime() -
        new Date(fixtureById.get(b.fixtureId).kickoff_utc).getTime()),
    }))
    .sort((a, b) => a.order - b.order)

  return { rounds, multiTribe }
}
