// ─── Domain types ────────────────────────────────────────────────────────────

export type RoundId  = 'gs' | 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'f'
export type RoundTab = 'gs' | 'r32' | 'r16' | 'qf' | 'sf' | 'finals'

// Static round groupings used for UI tabs and display logic
export const FINALS_ROUNDS:   RoundId[] = ['tp', 'f']
export const KNOCKOUT_ROUNDS: RoundId[] = ['r32', 'r16', 'qf', 'sf', 'tp', 'f']

// ─── Per-tournament round config (loaded from tournament_rounds DB table) ────

export interface RoundConfig {
  id:           string
  tournament_id: string
  round_code:   RoundId
  round_name:   string
  round_order:  number
  predict_mode: 'outcome' | 'score'
  result_pts:   number   // pts for correct outcome
  exact_bonus:  number   // extra pts when exact score predicted (0 if N/A)
  pen_bonus:    number   // extra pts when pen winner correct (0 if N/A)
  fav_team_2x:  boolean  // whether 2× multiplier applies for fav team
}

// Derived convenience arrays — computed from round configs at runtime
export interface TournamentScoringConfig {
  rounds:             Record<RoundId, RoundConfig>
  exact_score_rounds: RoundId[]   // rounds where predict_mode === 'score'
  pen_bonus_rounds:   RoundId[]   // rounds where pen_bonus > 0
  fav_team_rounds:    RoundId[]   // rounds where fav_team_2x === true
  outcome_rounds:     RoundId[]   // rounds where predict_mode === 'outcome'
}

/** Build a TournamentScoringConfig from an array of RoundConfig rows (from DB). */
export function buildScoringConfig(rows: RoundConfig[]): TournamentScoringConfig {
  const rounds = {} as Record<RoundId, RoundConfig>
  rows.forEach(r => { rounds[r.round_code] = r })
  return {
    rounds,
    exact_score_rounds: rows.filter(r => r.predict_mode === 'score').map(r => r.round_code),
    pen_bonus_rounds:   rows.filter(r => r.pen_bonus   >  0).map(r => r.round_code),
    fav_team_rounds:    rows.filter(r => r.fav_team_2x     ).map(r => r.round_code),
    outcome_rounds:     rows.filter(r => r.predict_mode === 'outcome').map(r => r.round_code),
  }
}

// ─── Hardcoded WC2026 fallback ────────────────────────────────────────────────
// Used when tournament_rounds rows have not yet loaded (e.g. SSR, cold start).
// Must match the seeded rows in migration 049.

// WC2026 hardcoded fallback — mirrors rows seeded in migration 049.
// Exported as a function (not a const) to avoid module-level TDZ issues.
export function getDefaultScoringConfig(): TournamentScoringConfig {
  return buildScoringConfig([
    { id: 'gs',  tournament_id: 'default', round_code: 'gs',  round_name: 'Group Stage',    round_order: 1, predict_mode: 'outcome', result_pts:  3, exact_bonus: 0, pen_bonus: 0, fav_team_2x: true  },
    { id: 'r32', tournament_id: 'default', round_code: 'r32', round_name: 'Round of 32',    round_order: 2, predict_mode: 'outcome', result_pts:  5, exact_bonus: 0, pen_bonus: 0, fav_team_2x: true  },
    { id: 'r16', tournament_id: 'default', round_code: 'r16', round_name: 'Round of 16',    round_order: 3, predict_mode: 'outcome', result_pts:  7, exact_bonus: 0, pen_bonus: 5, fav_team_2x: false },
    { id: 'qf',  tournament_id: 'default', round_code: 'qf',  round_name: 'Quarter-finals', round_order: 4, predict_mode: 'outcome', result_pts: 10, exact_bonus: 0, pen_bonus: 5, fav_team_2x: false },
    { id: 'sf',  tournament_id: 'default', round_code: 'sf',  round_name: 'Semi-finals',    round_order: 5, predict_mode: 'score',   result_pts: 15, exact_bonus: 5, pen_bonus: 5, fav_team_2x: false },
    { id: 'tp',  tournament_id: 'default', round_code: 'tp',  round_name: '3rd Place',      round_order: 6, predict_mode: 'score',   result_pts:  5, exact_bonus: 5, pen_bonus: 5, fav_team_2x: false },
    { id: 'f',   tournament_id: 'default', round_code: 'f',   round_name: 'Final',          round_order: 7, predict_mode: 'score',   result_pts: 25, exact_bonus: 5, pen_bonus: 5, fav_team_2x: false },
  ])
}

// Module-level singleton — initialised after all functions are defined, safe from TDZ
let _defaultConfig: TournamentScoringConfig | null = null
export function getDefaultScoringConfigCached(): TournamentScoringConfig {
  if (!_defaultConfig) _defaultConfig = getDefaultScoringConfig()
  return _defaultConfig
}

// Keep a named export for backwards compat — aliased to the cached getter result
// Note: accessed via function call to avoid TDZ on module init
export const DEFAULT_SCORING_CONFIG: TournamentScoringConfig = (() => getDefaultScoringConfig())()

// Convenience arrays — derived at module init, safe because functions are hoisted
export const EXACT_SCORE_ROUNDS:     RoundId[] = (() => getDefaultScoringConfig().exact_score_rounds)()
export const PEN_BONUS_ROUNDS:       RoundId[] = (() => getDefaultScoringConfig().pen_bonus_rounds)()
export const FAV_TEAM_DOUBLE_ROUNDS: RoundId[] = (() => getDefaultScoringConfig().fav_team_rounds)()
export const OUTCOME_ROUNDS:         RoundId[] = (() => getDefaultScoringConfig().outcome_rounds)()

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
 * Uses TournamentScoringConfig loaded from the tournament_rounds table.
 * Falls back to DEFAULT_SCORING_CONFIG if config is not provided.
 */
export function calcPoints(
  pred:   Pick<Prediction, 'home' | 'away' | 'pen_winner' | 'outcome'> | null | undefined,
  result: (MatchScore & { pen_winner?: string | null; result_outcome?: string | null }) | null | undefined,
  round:  RoundId,
  isFavourite = false,
  config: TournamentScoringConfig = DEFAULT_SCORING_CONFIG
): number | null {
  if (!result) return null
  if (!pred)   return 0

  const rc = config.rounds[round]
  if (!rc)     return null

  const multiplier = isFavourite && rc.fav_team_2x ? 2 : 1

  if (rc.predict_mode === 'score') {
    // ── Score-prediction round (sf / tp / f) ─────────────────────────────
    const resultOutcome = getOutcome(result.home, result.away)
    const predOutcome   = getOutcome(pred.home ?? 0, pred.away ?? 0)
    const isExactScore  = pred.home === result.home && pred.away === result.away

    if (isExactScore)             return (rc.result_pts + rc.exact_bonus) * multiplier
    if (predOutcome !== resultOutcome) return 0

    // Correct result, not exact — check pen winner bonus
    const drewAndPens = result.home === result.away && !!result.pen_winner
    const penCorrect  = drewAndPens && rc.pen_bonus > 0 && pred.pen_winner === result.pen_winner
    return (rc.result_pts + (penCorrect ? rc.pen_bonus : 0)) * multiplier

  } else {
    // ── Outcome-only round (gs / r32 / r16 / qf) ─────────────────────────
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
