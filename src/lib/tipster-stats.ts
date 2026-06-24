// Tipster Pro — advanced personal stats (Phase C).
// computeTipsterStats() builds the full v1 stat payload for one user + tournament from
// existing tables: predictions (scored), fixtures (results), the leaderboard MVs (rank +
// form curve), user_tournaments (favourite team) and tournament_teams.fifa_rank (the
// objective favourite signal). All inputs are small (≤~60 preds, ≤~110 fixtures, 59 teams)
// so everything is fetched once and joined in memory. Gating lives in the route.

const MIN_SCORED = 10        // below this, numbers aren't meaningful → "keep tipping"
const BIG_GAP    = 20        // FIFA-rank gap that marks a "clear favourite" match
const GLUT_BIAS  = 0.6       // avg goals over/under reality to read as a tendency

export interface TipsterPersona { key: string; label: string; emoji: string; blurb: string }

export interface TipsterStats {
  // headline
  rank: number
  totalPlayers: number
  topPercent: number              // rank / total, as a 1–100 figure (1 = very top)
  hitRate: number                 // 0..1, correct results / scored predictions
  predictionsMade: number
  correctCount: number
  totalPoints: number
  // streak
  longestStreak: number
  currentStreak: number
  // form curve (per scoring round, in order)
  form: { tab: string; order: number; points: number }[]
  // tendencies
  goalBias: number                // avg(predicted goals) − avg(actual goals) per match
  drawsCalled: { called: number; actualDraws: number; rate: number }
  // FIFA-rank modules
  chalkIndex: { backedFav: number; decisive: number; rate: number; hitRate: number }
  giantKiller: { backedDog: number; correct: number; rate: number }
  strengthAdjusted: { favHitRate: number | null; coinflipHitRate: number | null }
  biggestUpset: { home: string; away: string; picked: string; flag: string; gap: number; round: string } | null
  // bonus + highlights
  bonusPoints: number
  favouriteTeam: string | null
  best: { home: string; away: string; points: number; round: string } | null
  // identity
  persona: TipsterPersona
}

export type TipsterStatsResult =
  | { ok: true; stats: TipsterStats }
  | { ok: false; reason: 'no_data'; predictionsMade: number }

type Outcome = 'H' | 'A' | 'D'
const outcome = (h: number, a: number): Outcome => (h > a ? 'H' : h < a ? 'A' : 'D')

export async function computeTipsterStats(
  admin: any,
  userId: string,
  tournamentId: string,
): Promise<TipsterStatsResult> {
  // ── Pull everything in parallel ───────────────────────────────────────────────
  const [predsRes, fixturesRes, teamsRes, meRes, formRes, utRes, roundsRes] = await Promise.all([
    (admin.from('predictions') as any)
      .select('fixture_id, home, away, points_earned, standard_points, bonus_points')
      .eq('user_id', userId).eq('tournament_id', tournamentId)
      .not('points_earned', 'is', null),
    (admin.from('fixtures') as any)
      .select('id, home, away, home_score, away_score, kickoff_utc, round')
      .eq('tournament_id', tournamentId),
    (admin.from('tournament_teams') as any)
      .select('name, fifa_rank, flag_emoji').eq('tournament_id', tournamentId),
    (admin.from('leaderboard') as any)
      .select('total_points, total_bonus_points, correct_count, predictions_made')
      .eq('user_id', userId).eq('tournament_id', tournamentId).maybeSingle(),
    (admin.from('leaderboard_round_breakdown') as any)
      .select('tab_group, round_order, points')
      .eq('user_id', userId).eq('tournament_id', tournamentId).order('round_order'),
    (admin.from('user_tournaments') as any)
      .select('favourite_team').eq('user_id', userId).eq('tournament_id', tournamentId).maybeSingle(),
    (admin.from('tournament_rounds') as any)
      .select('round_code, include_in_scoring').eq('tournament_id', tournamentId),
  ])

  // Rounds flagged out of scoring (e.g. warm-up) must be excluded so per-prediction
  // tendencies reconcile with the leaderboard MV (which already filters them out).
  const scoresRound = new Map<string, boolean>()
  for (const r of (roundsRes.data ?? []) as any[]) scoresRound.set(r.round_code, r.include_in_scoring !== false)
  const isScoringRound = (code: string) => scoresRound.get(code) !== false

  const preds = (predsRes.data ?? []) as any[]
  const me    = (meRes.data ?? null) as any
  const predictionsMade = me?.predictions_made ?? preds.length

  if (predictionsMade < MIN_SCORED) {
    return { ok: false, reason: 'no_data', predictionsMade }
  }

  // ── Lookups ───────────────────────────────────────────────────────────────────
  const fixtureById = new Map<number, any>()
  for (const f of (fixturesRes.data ?? []) as any[]) fixtureById.set(f.id, f)

  const rankByTeam = new Map<string, number | null>()
  const flagByTeam = new Map<string, string>()
  for (const t of (teamsRes.data ?? []) as any[]) {
    rankByTeam.set(t.name, t.fifa_rank ?? null)
    flagByTeam.set(t.name, t.flag_emoji ?? '🏳️')
  }

  // ── Rank / percentile (count-based, avoids loading the whole board) ────────────
  const totalPoints = me?.total_points ?? 0
  const [{ count: totalPlayers }, { count: betterCount }] = await Promise.all([
    (admin.from('leaderboard') as any).select('user_id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId),
    (admin.from('leaderboard') as any).select('user_id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId).gt('total_points', totalPoints),
  ])
  const total = totalPlayers ?? 1
  const rank  = (betterCount ?? 0) + 1
  const topPercent = Math.max(1, Math.round((rank / total) * 100))

  const correctCount = me?.correct_count ?? 0
  const hitRate = predictionsMade ? correctCount / predictionsMade : 0

  // ── Single pass over scored predictions ────────────────────────────────────────
  // Order by kickoff for streaks.
  const scored = preds
    .map(p => ({ p, f: fixtureById.get(p.fixture_id) }))
    .filter(x => x.f && x.f.home_score != null && x.f.away_score != null && isScoringRound(x.f.round))
    .sort((a, b) => new Date(a.f.kickoff_utc).getTime() - new Date(b.f.kickoff_utc).getTime())

  let longestStreak = 0, currentStreak = 0, run = 0
  let predGoals = 0, actGoals = 0, goalN = 0
  let calledDraws = 0, actualDraws = 0
  let backedFav = 0, favCorrect = 0, decisive = 0, backedDog = 0, dogCorrect = 0
  let favBucketHit = 0, favBucketN = 0, coinHit = 0, coinN = 0
  let best: TipsterStats['best'] = null
  let biggestUpset: TipsterStats['biggestUpset'] = null

  for (const { p, f } of scored) {
    const correct = (p.standard_points ?? 0) > 0

    // streak (chronological)
    if (correct) { run++; longestStreak = Math.max(longestStreak, run) } else { run = 0 }
    currentStreak = run

    // goal bias
    predGoals += (p.home + p.away); actGoals += (f.home_score + f.away_score); goalN++

    // draws called
    const actO = outcome(f.home_score, f.away_score)
    const predO = outcome(p.home, p.away)
    if (actO === 'D') { actualDraws++; if (predO === 'D') calledDraws++ }

    // best pick
    if (best == null || (p.points_earned ?? 0) > best.points) {
      best = { home: f.home, away: f.away, points: p.points_earned ?? 0, round: f.round }
    }

    // ── FIFA-rank modules (need both teams ranked) ──────────────────────────────
    const rH = rankByTeam.get(f.home) ?? null
    const rA = rankByTeam.get(f.away) ?? null
    if (rH == null || rA == null) continue
    const gap = Math.abs(rH - rA)

    // strength-adjusted accuracy (by match closeness, regardless of who they backed)
    if (gap >= BIG_GAP) { favBucketN++; if (correct) favBucketHit++ }
    else                { coinN++;     if (correct) coinHit++ }

    // chalk vs giant-killer (only decisive picks — backing a side to win)
    if (predO === 'D') continue
    decisive++
    const favTeam = rH <= rA ? f.home : f.away        // lower rank number = favourite
    const pickedTeam = predO === 'H' ? f.home : f.away
    if (pickedTeam === favTeam) {
      backedFav++; if (correct) favCorrect++
    } else {
      backedDog++
      if (correct) {
        dogCorrect++
        if (biggestUpset == null || gap > biggestUpset.gap) {
          biggestUpset = { home: f.home, away: f.away, picked: pickedTeam, flag: flagByTeam.get(pickedTeam) ?? '🏳️', gap, round: f.round }
        }
      }
    }
  }

  const goalBias = goalN ? +(predGoals / goalN - actGoals / goalN).toFixed(2) : 0
  const chalkRate = decisive ? backedFav / decisive : 0
  const chalkHit  = backedFav ? favCorrect / backedFav : 0
  const dogRate   = backedDog ? dogCorrect / backedDog : 0

  const stats: TipsterStats = {
    rank, totalPlayers: total, topPercent,
    hitRate, predictionsMade, correctCount, totalPoints,
    longestStreak, currentStreak,
    form: (formRes.data ?? []).map((r: any) => ({ tab: r.tab_group, order: r.round_order, points: r.points })),
    goalBias,
    drawsCalled: { called: calledDraws, actualDraws, rate: actualDraws ? calledDraws / actualDraws : 0 },
    chalkIndex: { backedFav, decisive, rate: chalkRate, hitRate: chalkHit },
    giantKiller: { backedDog, correct: dogCorrect, rate: dogRate },
    strengthAdjusted: {
      favHitRate: favBucketN ? favBucketHit / favBucketN : null,
      coinflipHitRate: coinN ? coinHit / coinN : null,
    },
    biggestUpset,
    bonusPoints: me?.total_bonus_points ?? 0,
    favouriteTeam: (utRes.data as any)?.favourite_team ?? null,
    best,
    persona: derivePersona({ topPercent, hitRate, chalkRate, dogRate, goalBias, drawRate: actualDraws ? calledDraws / actualDraws : 0, actualDraws }),
  }
  return { ok: true, stats }
}

// Rule-based archetype — first match wins, so order = specificity.
function derivePersona(s: {
  topPercent: number; hitRate: number; chalkRate: number; dogRate: number
  goalBias: number; drawRate: number; actualDraws: number
}): TipsterPersona {
  if (s.topPercent <= 10 && s.hitRate >= 0.6)
    return { key: 'oracle', label: 'The Oracle', emoji: '🔮', blurb: 'Top of the pile and rarely wrong — you see what others miss.' }
  if (s.dogRate >= 0.4 || s.chalkRate <= 0.4)
    return { key: 'maverick', label: 'The Maverick', emoji: '🎲', blurb: 'You back the underdog and make it pay. Chaos is a ladder.' }
  if (s.chalkRate >= 0.7)
    return { key: 'banker', label: 'The Banker', emoji: '🏦', blurb: 'You ride the favourites. No drama, just points in the bank.' }
  if (s.goalBias >= GLUT_BIAS)
    return { key: 'glutton', label: 'The Goal Glutton', emoji: '🍔', blurb: 'You always smell goals — your scorelines run hot.' }
  if (s.actualDraws >= 4 && s.drawRate >= 0.5)
    return { key: 'whisperer', label: 'The Stalemate Whisperer', emoji: '🤝', blurb: 'You call the draws nobody else dares to. Spooky.' }
  return { key: 'allrounder', label: 'The All-Rounder', emoji: '⚽', blurb: 'No glaring weakness — you take what the games give you.' }
}
