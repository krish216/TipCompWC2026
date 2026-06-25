// Medals & badges — free engagement layer. Round medals (🥇🥈🥉 for top-3 by round
// points in your tribe) + a tight set of standing badges. All computed from the
// leaderboard / round-breakdown MVs + a quick streak walk. NOT Pro-gated.

export interface RoundMedal { round: string; label: string; order: number; place: 1 | 2 | 3 }
export interface Badge { key: string; emoji: string; label: string; earned: boolean; hint: string }
export interface Achievements {
  globalRank: number | null
  totalPlayers: number
  totalPoints: number
  medals: RoundMedal[]
  badges: Badge[]
}

const MIN_PREDICTIONS = 10
const STREAK_BADGE = 5
const SHARP_RATE = 0.6
const TON = 100

export async function computeAchievements(
  admin: any,
  userId: string,
  tournamentId: string,
  tribeId: string | null,
): Promise<Achievements> {
  const [meRes, totalRes, betterCountStart, tribeMembersRes, roundsRes, predsRes, fixturesRes] = await Promise.all([
    (admin.from('leaderboard') as any).select('total_points, correct_count, predictions_made')
      .eq('user_id', userId).eq('tournament_id', tournamentId).maybeSingle(),
    (admin.from('leaderboard') as any).select('user_id', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
    Promise.resolve(null),
    tribeId ? (admin.from('tribe_members') as any).select('user_id').eq('tribe_id', tribeId) : Promise.resolve({ data: [] }),
    (admin.from('tournament_rounds') as any).select('round_code, tab_label, round_order').eq('tournament_id', tournamentId),
    (admin.from('predictions') as any).select('fixture_id, standard_points')
      .eq('user_id', userId).eq('tournament_id', tournamentId).not('points_earned', 'is', null),
    (admin.from('fixtures') as any).select('id, round, kickoff_utc, home_score').eq('tournament_id', tournamentId),
  ])

  // A round only awards medals once ALL its fixtures are settled (no provisional
  // medals for a round still being played).
  const roundFixtures = new Map<string, any[]>()
  for (const f of (fixturesRes.data ?? []) as any[]) {
    if (!roundFixtures.has(f.round)) roundFixtures.set(f.round, [])
    roundFixtures.get(f.round)!.push(f)
  }
  const completeRounds = new Set<string>()
  for (const [code, fxs] of roundFixtures) if (fxs.every(f => f.home_score != null)) completeRounds.add(code)

  const me = (meRes.data ?? null) as any
  const totalPoints = me?.total_points ?? 0
  const predictions = me?.predictions_made ?? 0
  const hitRate = predictions ? (me?.correct_count ?? 0) / predictions : 0

  // Global rank — count of players with more points + 1.
  const { count: better } = await (admin.from('leaderboard') as any)
    .select('user_id', { count: 'exact', head: true }).eq('tournament_id', tournamentId).gt('total_points', totalPoints)
  const globalRank = me ? (better ?? 0) + 1 : null
  const totalPlayers = totalRes.count ?? 0

  // Longest correct-result streak (chronological).
  const fixById = new Map(((fixturesRes.data ?? []) as any[]).map(f => [f.id, f]))
  const scored = ((predsRes.data ?? []) as any[])
    .map(p => ({ p, f: fixById.get(p.fixture_id) }))
    .filter(x => x.f && x.f.home_score != null)
    .sort((a, b) => new Date(a.f.kickoff_utc).getTime() - new Date(b.f.kickoff_utc).getTime())
  let longestStreak = 0, run = 0
  for (const { p } of scored) { if ((p.standard_points ?? 0) > 0) { run++; longestStreak = Math.max(longestStreak, run) } else run = 0 }

  // Round medals — rank tribe members by round points, per round; top 3 → medal.
  const roundLabel = new Map<string, { label: string; order: number }>()
  for (const r of (roundsRes.data ?? []) as any[]) roundLabel.set(r.round_code, { label: r.tab_label ?? r.round_code.toUpperCase(), order: r.round_order ?? 999 })

  const medals: RoundMedal[] = []
  const tribeIds = ((tribeMembersRes.data ?? []) as any[]).map(m => m.user_id)
  if (tribeId && tribeIds.length > 1) {
    const { data: brk } = await (admin.from('leaderboard_round_breakdown') as any)
      .select('user_id, tab_group, round_order, points').eq('tournament_id', tournamentId).in('user_id', tribeIds)
    const byRound = new Map<string, { user_id: string; points: number }[]>()
    for (const r of (brk ?? []) as any[]) {
      if (!byRound.has(r.tab_group)) byRound.set(r.tab_group, [])
      byRound.get(r.tab_group)!.push({ user_id: r.user_id, points: r.points })
    }
    for (const [tab, rows] of byRound) {
      if (!completeRounds.has(tab)) continue   // round still in play → no medal yet
      rows.sort((a, b) => b.points - a.points)
      const idx = rows.findIndex(r => r.user_id === userId)
      if (idx >= 0 && idx < 3 && rows[idx].points > 0) {
        const meta = roundLabel.get(tab) ?? { label: tab.toUpperCase(), order: 999 }
        medals.push({ round: tab, label: meta.label, order: meta.order, place: (idx + 1) as 1 | 2 | 3 })
      }
    }
    medals.sort((a, b) => a.order - b.order)
  }
  const wonARound = medals.some(m => m.place === 1)

  const badges: Badge[] = [
    { key: 'top50',  emoji: '🏅', label: 'Top 50',       earned: globalRank != null && globalRank <= 50, hint: 'Reach the global top 50' },
    { key: 'top10',  emoji: '🏆', label: 'Top 10',       earned: globalRank != null && globalRank <= 10, hint: 'Reach the global top 10' },
    { key: 'roundw', emoji: '🥇', label: 'Round winner', earned: wonARound,                              hint: 'Top your tribe in a round' },
    { key: 'sharp',  emoji: '🎯', label: 'Sharpshooter', earned: predictions >= MIN_PREDICTIONS && hitRate >= SHARP_RATE, hint: `${Math.round(SHARP_RATE * 100)}%+ hit-rate` },
    { key: 'fire',   emoji: '🔥', label: 'On fire',      earned: longestStreak >= STREAK_BADGE,          hint: `${STREAK_BADGE} correct in a row` },
    { key: 'ton',    emoji: '💯', label: 'Ton up',       earned: totalPoints >= TON,                     hint: `Bank ${TON} points` },
  ]

  return { globalRank, totalPlayers, totalPoints, medals, badges }
}
