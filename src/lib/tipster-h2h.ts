// Tipster Pro — Head-to-head (Rivals). Beat-your-mate comparison vs a tribe rival:
// the scoreline (tournament points), rounds won each, hit-rate, bonus-team face-off,
// and the SWING fixtures that decided the gap. Built from the leaderboard MVs +
// predictions/fixtures + user_tournaments. Rival must share the caller's tribe.

type Outcome = 'H' | 'D' | 'A'
const sign = (h: number, a: number): Outcome => (h > a ? 'H' : h < a ? 'A' : 'D')
const pickOf = (p: any): Outcome => (p.outcome as Outcome | null) ?? sign(p.home, p.away)

export interface H2HRival { id: string; name: string; avatarUrl: string | null; points: number }

export interface H2HSide {
  id: string; name: string; avatarUrl: string | null
  points: number; correct: number; predictions: number
  bonusPoints: number; bonusTeam: string | null
}
export interface H2HSwing {
  fixtureId: number; home: string; away: string; homeScore: number; awayScore: number; round: string
  myOutcome: Outcome; rivalOutcome: Outcome; myPoints: number; rivalPoints: number; delta: number
}
export interface H2H {
  me: H2HSide; rival: H2HSide
  roundsWon: { me: number; rival: number; tied: number }
  rounds: { tab: string; order: number; mine: number; theirs: number }[]
  swing: H2HSwing[]
}

// Tribe-mates the caller can face (excludes self + mock), ladder order.
export async function listRivals(admin: any, userId: string, tribeId: string, tournamentId: string) {
  const { data: members } = await (admin.from('tribe_members') as any).select('user_id').eq('tribe_id', tribeId)
  const { data: mock } = await (admin.from('users') as any).select('id').like('email', '%@tribepicks.dev')
  const mockSet = new Set(((mock ?? []) as any[]).map(u => u.id))
  const ids = ((members ?? []) as any[]).map(m => m.user_id).filter((x: string) => x !== userId && !mockSet.has(x))

  const allIds = [...ids, userId]
  const { data: lb } = allIds.length
    ? await (admin.from('leaderboard') as any).select('user_id, total_points').eq('tournament_id', tournamentId).in('user_id', allIds)
    : { data: [] }
  const ptsById = new Map(((lb ?? []) as any[]).map(r => [r.user_id, r.total_points]))
  const { data: users } = ids.length
    ? await (admin.from('users') as any).select('id, display_name, avatar_url').in('id', ids)
    : { data: [] }
  const uById = new Map(((users ?? []) as any[]).map(u => [u.id, u]))

  const rivals: H2HRival[] = ids.map((id: string) => ({
    id, name: uById.get(id)?.display_name ?? 'Player', avatarUrl: uById.get(id)?.avatar_url ?? null,
    points: ptsById.get(id) ?? 0,
  })).sort((a, b) => b.points - a.points)

  return { rivals, myPoints: ptsById.get(userId) ?? 0 }
}

export async function computeH2H(admin: any, userId: string, rivalId: string, tournamentId: string): Promise<H2H> {
  const pair = [userId, rivalId]
  const [lbRes, brkRes, predsRes, fxRes, roundsRes, utRes, usersRes] = await Promise.all([
    (admin.from('leaderboard') as any)
      .select('user_id, total_points, correct_count, predictions_made, total_bonus_points')
      .eq('tournament_id', tournamentId).in('user_id', pair),
    (admin.from('leaderboard_round_breakdown') as any)
      .select('user_id, tab_group, round_order, points').eq('tournament_id', tournamentId).in('user_id', pair),
    (admin.from('predictions') as any)
      .select('user_id, fixture_id, home, away, outcome, points_earned')
      .eq('tournament_id', tournamentId).in('user_id', pair).not('points_earned', 'is', null),
    (admin.from('fixtures') as any)
      .select('id, home, away, home_score, away_score, round').eq('tournament_id', tournamentId),
    (admin.from('tournament_rounds') as any)
      .select('round_code, include_in_scoring').eq('tournament_id', tournamentId),
    (admin.from('user_tournaments') as any).select('user_id, favourite_team').eq('tournament_id', tournamentId).in('user_id', pair),
    (admin.from('users') as any).select('id, display_name, avatar_url').in('id', pair),
  ])

  // Same scoring filter as the leaderboard MV — exclude rounds flagged out of scoring
  // (e.g. the warm-up round 'wup') so they don't leak into the swing fixtures.
  const roundMeta = new Map(((roundsRes.data ?? []) as any[]).map(r => [r.round_code, r.include_in_scoring]))
  const isScoring = (code: string) => roundMeta.get(code) !== false

  const lb = new Map(((lbRes.data ?? []) as any[]).map(r => [r.user_id, r]))
  const ut = new Map(((utRes.data ?? []) as any[]).map(r => [r.user_id, r.favourite_team]))
  const us = new Map(((usersRes.data ?? []) as any[]).map(u => [u.id, u]))
  const side = (id: string): H2HSide => {
    const l = lb.get(id) as any
    return {
      id, name: us.get(id)?.display_name ?? 'Player', avatarUrl: us.get(id)?.avatar_url ?? null,
      points: l?.total_points ?? 0, correct: l?.correct_count ?? 0, predictions: l?.predictions_made ?? 0,
      bonusPoints: l?.total_bonus_points ?? 0, bonusTeam: ut.get(id) ?? null,
    }
  }
  const me = side(userId), rival = side(rivalId)

  // Rounds won — per tab_group, who scored more.
  const roundPts = new Map<string, { order: number; mine: number; theirs: number }>()
  for (const r of (brkRes.data ?? []) as any[]) {
    const e = roundPts.get(r.tab_group) ?? { order: r.round_order, mine: 0, theirs: 0 }
    if (r.user_id === userId) e.mine = r.points; else e.theirs = r.points
    roundPts.set(r.tab_group, e)
  }
  const rounds = [...roundPts.entries()].map(([tab, v]) => ({ tab, order: v.order, mine: v.mine, theirs: v.theirs }))
    .sort((a, b) => a.order - b.order)
  const roundsWon = rounds.reduce((acc, r) => {
    if (r.mine > r.theirs) acc.me++; else if (r.theirs > r.mine) acc.rival++; else acc.tied++
    return acc
  }, { me: 0, rival: 0, tied: 0 })

  // Swing fixtures — shared, both-scored fixtures, biggest points delta.
  const fxById = new Map(((fxRes.data ?? []) as any[]).map(f => [f.id, f]))
  const mineByFx = new Map<number, any>(), rivalByFx = new Map<number, any>()
  for (const p of (predsRes.data ?? []) as any[]) (p.user_id === userId ? mineByFx : rivalByFx).set(p.fixture_id, p)
  const swing: H2HSwing[] = []
  for (const [fid, mp] of mineByFx) {
    const rp = rivalByFx.get(fid); const f = fxById.get(fid)
    if (!rp || !f || f.home_score == null || !isScoring(f.round)) continue
    const myPoints = mp.points_earned ?? 0, rivalPoints = rp.points_earned ?? 0
    if (myPoints === rivalPoints) continue
    swing.push({
      fixtureId: fid, home: f.home, away: f.away, homeScore: f.home_score, awayScore: f.away_score, round: f.round,
      myOutcome: pickOf(mp), rivalOutcome: pickOf(rp), myPoints, rivalPoints, delta: myPoints - rivalPoints,
    })
  }
  swing.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return { me, rival, roundsWon, rounds, swing: swing.slice(0, 8) }
}
