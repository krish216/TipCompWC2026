// Single-match challenge scoring — a pure function, safe to import anywhere.
//
// A fan predicts the full-time scoreline (excl. penalty shootout) and, for a
// knockout, which team advances (the draw resolver). We score on read against the
// fixture result:
//   • exact scoreline           → EXACT (5)
//   • correct outcome (H/D/A)   → OUTCOME (2)
//   • correct team advancing    → +ADVANCER (1), stacks with the above
// Max 6 (an exact non-draw prediction implies the right advancer).
//
// Ranking (see rankMatchEntries): points desc, then closeness of goal-difference,
// then closeness of total goals, then who entered first.

export const PTS = { EXACT: 5, OUTCOME: 2, ADVANCER: 1 } as const

export interface MatchFixtureResult {
  home:        string
  away:        string
  home_score:  number | null
  away_score:  number | null
  pen_winner?: string | null   // team name that won a penalty shootout (draw at FT/ET)
}

export interface MatchPrediction {
  pred_home:     number
  pred_away:     number
  advances_team: string | null
}

const outcome = (h: number, a: number): 'H' | 'D' | 'A' => (h > a ? 'H' : a > h ? 'A' : 'D')

// The team that actually goes through: the winner, or the shootout winner on a draw.
export function actualAdvancer(f: MatchFixtureResult): string | null {
  if (f.home_score == null || f.away_score == null) return null
  if (f.home_score > f.away_score) return f.home
  if (f.away_score > f.home_score) return f.away
  return f.pen_winner ?? null
}

// True once the fixture has a final scoreline to score against.
export const isSettled = (f: MatchFixtureResult): boolean =>
  f.home_score != null && f.away_score != null

export interface MatchScore {
  points:         number
  exact:          boolean
  outcomeCorrect: boolean
  advancerCorrect: boolean
}

export function scoreMatchEntry(p: MatchPrediction, f: MatchFixtureResult): MatchScore {
  if (!isSettled(f)) return { points: 0, exact: false, outcomeCorrect: false, advancerCorrect: false }
  const h = f.home_score as number, a = f.away_score as number

  const exact          = p.pred_home === h && p.pred_away === a
  const outcomeCorrect = outcome(p.pred_home, p.pred_away) === outcome(h, a)
  const adv            = actualAdvancer(f)
  const advancerCorrect = !!(p.advances_team && adv && p.advances_team === adv)

  let points = 0
  if (exact) points += PTS.EXACT
  else if (outcomeCorrect) points += PTS.OUTCOME
  if (advancerCorrect) points += PTS.ADVANCER

  return { points, exact, outcomeCorrect, advancerCorrect }
}

// Sort entries best-first. `entered_at` is an ISO string used only as the final
// tiebreak (earliest entrant wins a dead heat). Returns a new sorted array.
export function rankMatchEntries<T extends MatchPrediction & { entered_at?: string | null }>(
  entries: T[],
  f: MatchFixtureResult,
): (T & { score: MatchScore })[] {
  const gd = f.home_score != null && f.away_score != null ? f.home_score - f.away_score : null
  const tot = f.home_score != null && f.away_score != null ? f.home_score + f.away_score : null
  return entries
    .map(e => ({ ...e, score: scoreMatchEntry(e, f) }))
    .sort((x, y) => {
      if (y.score.points !== x.score.points) return y.score.points - x.score.points
      if (gd != null) {
        const dx = Math.abs((x.pred_home - x.pred_away) - gd)
        const dy = Math.abs((y.pred_home - y.pred_away) - gd)
        if (dx !== dy) return dx - dy
      }
      if (tot != null) {
        const tx = Math.abs((x.pred_home + x.pred_away) - tot)
        const ty = Math.abs((y.pred_home + y.pred_away) - tot)
        if (tx !== ty) return tx - ty
      }
      return String(x.entered_at ?? '').localeCompare(String(y.entered_at ?? ''))
    })
}
