// ─── Domain types ────────────────────────────────────────────────────────────

export type RoundId  = 'gs' | 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'f'
export type RoundTab = 'gs' | 'r32' | 'r16' | 'qf' | 'sf' | 'finals'

// Static round groupings — plain literals, no computed values, no TDZ risk
export const FINALS_ROUNDS:          RoundId[] = ['tp', 'f']
export const KNOCKOUT_ROUNDS:        RoundId[] = ['r32', 'r16', 'qf', 'sf', 'tp', 'f']
export const EXACT_SCORE_ROUNDS:     RoundId[] = ['sf', 'tp', 'f']
export const OUTCOME_ROUNDS:         RoundId[] = ['gs', 'r32', 'r16', 'qf']
export const PEN_BONUS_ROUNDS:       RoundId[] = ['r32', 'r16', 'qf', 'sf', 'tp', 'f']
export const FAV_TEAM_DOUBLE_ROUNDS: RoundId[] = ['gs', 'r32']

// ─── Per-tournament round config (loaded from tournament_rounds DB table) ────

export interface RoundConfig {
  id:            string
  tournament_id: string
  round_code:    RoundId
  round_name:    string
  round_order:   number
  predict_mode:  'outcome' | 'score'
  result_pts:    number
  exact_bonus:   number
  pen_bonus:     number
  fav_team_2x:   boolean
}

export interface TournamentScoringConfig {
  rounds:             Record<RoundId, RoundConfig>
  exact_score_rounds: RoundId[]
  pen_bonus_rounds:   RoundId[]
  fav_team_rounds:    RoundId[]
  outcome_rounds:     RoundId[]
}

/** Build a TournamentScoringConfig from an array of RoundConfig rows from the DB. */
export function buildScoringConfig(rows: RoundConfig[]): TournamentScoringConfig {
  const rounds = {} as Record<RoundId, RoundConfig>
  rows.forEach(r => { rounds[r.round_code] = r })
  return {
    rounds,
    exact_score_rounds: rows.filter(r => r.predict_mode === 'score').map(r => r.round_code),
    pen_bonus_rounds:   rows.filter(r => r.pen_bonus > 0).map(r => r.round_code),
    fav_team_rounds:    rows.filter(r => r.fav_team_2x).map(r => r.round_code),
    outcome_rounds:     rows.filter(r => r.predict_mode === 'outcome').map(r => r.round_code),
  }
}

/**
 * Returns the WC2026 hardcoded fallback config — called as a function so it
 * never runs at module evaluation time (avoids TDZ in bundled output).
 * Mirrors rows seeded in migration 049.
 */
export function getDefaultScoringConfig(): TournamentScoringConfig {
  return buildScoringConfig([
    { id: 'gs',  tournament_id: 'default', round_code: 'gs',  round_name: 'Group Stage',    round_order: 1, predict_mode: 'outcome', result_pts:  3, exact_bonus: 0, pen_bonus: 0, fav_team_2x: true  },
    { id: 'r32', tournament_id: 'default', round_code: 'r32', round_name: 'Round of 32',    round_order: 2, predict_mode: 'outcome', result_pts:  5, exact_bonus: 0, pen_bonus: 5, fav_team_2x: true  },
    { id: 'r16', tournament_id: 'default', round_code: 'r16', round_name: 'Round of 16',    round_order: 3, predict_mode: 'outcome', result_pts:  7, exact_bonus: 0, pen_bonus: 5, fav_team_2x: false },
    { id: 'qf',  tournament_id: 'default', round_code: 'qf',  round_name: 'Quarter-finals', round_order: 4, predict_mode: 'outcome', result_pts: 10, exact_bonus: 0, pen_bonus: 5, fav_team_2x: false },
    { id: 'sf',  tournament_id: 'default', round_code: 'sf',  round_name: 'Semi-finals',    round_order: 5, predict_mode: 'score',   result_pts: 15, exact_bonus: 5, pen_bonus: 5, fav_team_2x: false },
    { id: 'tp',  tournament_id: 'default', round_code: 'tp',  round_name: '3rd Place',      round_order: 6, predict_mode: 'score',   result_pts:  5, exact_bonus: 5, pen_bonus: 5, fav_team_2x: false },
    { id: 'f',   tournament_id: 'default', round_code: 'f',   round_name: 'Final',          round_order: 7, predict_mode: 'score',   result_pts: 25, exact_bonus: 5, pen_bonus: 5, fav_team_2x: false },
  ])
}

// ─── Entity types ─────────────────────────────────────────────────────────────

export interface Fixture {
  id:          number
  round:       RoundId
  group?:      string
  home:        string
  away:        string
  date:        string
  kickoff_utc: string
  venue:       string
  result?:     MatchScore
}

export interface MatchScore {
  home: number
  away: number
}

export interface Prediction {
  fixture_id:     number
  user_id:        string
  home:           number
  away:           number
  outcome?:       'H' | 'D' | 'A' | null
  pen_winner?:    string | null
  created_at:     string
  updated_at:     string
  points_earned?: number
}

export interface User {
  id: string; email: string; display_name: string
  avatar_url?: string; tribe_id?: string; created_at: string
}
export interface Tribe {
  id: string; name: string; invite_code: string
  created_by: string; created_at: string; member_count?: number
}
export interface TribeMember {
  user_id: string; tribe_id: string; joined_at: string; user?: User
}
export interface ChatMessage {
  id: string; tribe_id: string; user_id: string
  content: string; created_at: string
  user?: Pick<User, 'display_name' | 'avatar_url'>
}
export interface LeaderboardEntry {
  user_id: string; display_name: string; tribe_name?: string
  total_points: number; bonus_count: number; correct_count: number
  predictions_made: number; rank?: number
  round_breakdown?: Record<RoundId, number>
}

export interface ApiResponse<T> { data?: T; error?: string; status: number }
export interface PredictionSubmit { fixture_id: number; home: number; away: number }
export interface ResultSubmit     { fixture_id: number; home: number; away: number }

// ─── Scoring helpers ──────────────────────────────────────────────────────────

export function getOutcome(h: number, a: number): 'H' | 'A' | 'D' {
  if (h > a) return 'H'; if (a > h) return 'A'; return 'D'
}

/**
 * Calculate points for a prediction against a result.
 * Pass scoringConfig from UserPrefsContext (loaded from tournament_rounds table).
 * Falls back to getDefaultScoringConfig() if not provided.
 */
export function calcPoints(
  pred:        Pick<Prediction, 'home' | 'away' | 'pen_winner' | 'outcome'> | null | undefined,
  result:      (MatchScore & { pen_winner?: string | null; result_outcome?: string | null }) | null | undefined,
  round:       RoundId,
  isFavourite: boolean = false,
  config?:     TournamentScoringConfig
): number | null {
  if (!result) return null
  if (!pred)   return 0

  const cfg = config ?? getDefaultScoringConfig()
  const rc  = cfg.rounds[round]
  if (!rc)  return null

  const multiplier = isFavourite && rc.fav_team_2x ? 2 : 1

  if (rc.predict_mode === 'score') {
    // Score-prediction rounds (sf / tp / f)
    const resultOutcome = getOutcome(result.home, result.away)
    const predOutcome   = getOutcome(pred.home ?? 0, pred.away ?? 0)
    const isExactScore  = pred.home === result.home && pred.away === result.away

    if (isExactScore) return (rc.result_pts + rc.exact_bonus) * multiplier
    if (predOutcome !== resultOutcome) return 0

    const drewAndPens = result.home === result.away && !!result.pen_winner
    const penCorrect  = drewAndPens && rc.pen_bonus > 0 && pred.pen_winner === result.pen_winner
    return (rc.result_pts + (penCorrect ? rc.pen_bonus : 0)) * multiplier

  } else {
    // Outcome-only rounds (gs / r32 / r16 / qf)
    const predOutcome   = pred.outcome ?? getOutcome(pred.home ?? 0, pred.away ?? 0)
    const resultOutcome = result.result_outcome ?? getOutcome(result.home, result.away)
    if (predOutcome !== resultOutcome) return 0

    const penCorrect = rc.pen_bonus > 0
      && result.result_outcome === 'D'
      && !!result.pen_winner
      && pred.pen_winner === result.pen_winner
    return (rc.result_pts + (penCorrect ? rc.pen_bonus : 0)) * multiplier
  }
}
