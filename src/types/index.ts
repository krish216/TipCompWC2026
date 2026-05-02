// ─── Domain types ────────────────────────────────────────────────────────────

// RoundId is now dynamic — pulled from tournament_rounds table, not hardcoded enum
export type RoundId  = string
export type RoundTab = string

// ── Static arrays REMOVED — use TournamentScoringConfig derived sets instead:
// scoringConfig.knockout_rounds    (replaces KNOCKOUT_ROUNDS)
// scoringConfig.outcome_rounds     (replaces OUTCOME_ROUNDS)
// scoringConfig.exact_score_rounds (replaces EXACT_SCORE_ROUNDS)
// scoringConfig.pen_bonus_rounds   (replaces PEN_BONUS_ROUNDS)
// scoringConfig.fav_team_rounds    (replaces FAV_TEAM_DOUBLE_ROUNDS)
//
// Kept only for legacy compatibility — do not use in new code:
/** @deprecated use scoringConfig.knockout_rounds */
export const KNOCKOUT_ROUNDS:        RoundId[] = ['r32', 'r16', 'qf', 'sf', 'tp', 'f']
/** @deprecated use scoringConfig.exact_score_rounds */
export const EXACT_SCORE_ROUNDS:     RoundId[] = ['sf', 'tp', 'f']
/** @deprecated use scoringConfig.outcome_rounds */
export const OUTCOME_ROUNDS:         RoundId[] = ['gs', 'r32', 'r16', 'qf']

// ─── Per-tournament round config (loaded from tournament_rounds DB table) ────

export interface RoundConfig {
  id:                  string
  tournament_id:       string
  round_code:          RoundId
  round_name:          string
  round_order:         number
  tab_group:           string    // UI tab this round belongs to
  tab_label?:          string    // display label for the tab (overrides round_name) — from tournament_rounds.tab_group
  is_knockout:         boolean   // single-elimination format — pen winner can apply
  predict_mode:        'outcome' | 'score'
  result_pts:          number
  exact_bonus:         number
  margin_bonus:        number
  pen_bonus:           number
  fav_team_2x:         boolean
  include_in_scoring:  boolean   // when false: zero points, hidden from leaderboard breakdown and Tribe Picks
}

export interface TournamentScoringConfig {
  rounds:              Record<RoundId, RoundConfig>
  // All derived from tournament_rounds rows — no hardcoding:
  knockout_rounds:     RoundId[]   // is_knockout === true
  outcome_rounds:      RoundId[]   // predict_mode === 'outcome'
  exact_score_rounds:  RoundId[]   // predict_mode === 'score'
  pen_bonus_rounds:    RoundId[]   // pen_bonus > 0
  margin_bonus_rounds: RoundId[]   // margin_bonus > 0
  fav_team_rounds:     RoundId[]   // fav_team_2x === true
}

/** Build a TournamentScoringConfig from an array of RoundConfig rows from the DB.
 *  All derived sets are computed here — no hardcoded round codes anywhere. */
export function buildScoringConfig(rows: RoundConfig[]): TournamentScoringConfig {
  const rounds = {} as Record<RoundId, RoundConfig>
  rows.forEach(r => { rounds[r.round_code] = r })
  return {
    rounds,
    knockout_rounds:     rows.filter(r => r.is_knockout).map(r => r.round_code),
    outcome_rounds:      rows.filter(r => r.predict_mode === 'outcome').map(r => r.round_code),
    exact_score_rounds:  rows.filter(r => r.predict_mode === 'score').map(r => r.round_code),
    pen_bonus_rounds:    rows.filter(r => r.pen_bonus > 0).map(r => r.round_code),
    margin_bonus_rounds: rows.filter(r => r.margin_bonus > 0).map(r => r.round_code),
    fav_team_rounds:     rows.filter(r => r.fav_team_2x).map(r => r.round_code),
  }
}

/**
 * Returns the WC2026 hardcoded fallback config — called as a function so it
 * never runs at module evaluation time (avoids TDZ in bundled output).
 * Mirrors rows seeded in migration 049 + 081.
 */
export function getDefaultScoringConfig(): TournamentScoringConfig {
  return buildScoringConfig([
    { id: 'gs1',  tournament_id: 'default', round_code: 'gs1',  is_knockout: false, round_name: 'Group Stage1',    round_order: 1, tab_group: 'gs1',     predict_mode: 'outcome', result_pts:  3, exact_bonus: 0, margin_bonus: 0, pen_bonus: 0, fav_team_2x: true,  include_in_scoring: true },
    { id: 'gs2',  tournament_id: 'default', round_code: 'gs2',  is_knockout: false, round_name: 'Group Stage2',    round_order: 1, tab_group: 'gs2',     predict_mode: 'outcome', result_pts:  3, exact_bonus: 0, margin_bonus: 0, pen_bonus: 0, fav_team_2x: true,  include_in_scoring: true },
    { id: 'gs3',  tournament_id: 'default', round_code: 'gs3',  is_knockout: false, round_name: 'Group Stage3',    round_order: 1, tab_group: 'gs3',     predict_mode: 'outcome', result_pts:  3, exact_bonus: 0, margin_bonus: 0, pen_bonus: 0, fav_team_2x: true,  include_in_scoring: true },
    { id: 'r32',  tournament_id: 'default', round_code: 'r32',  is_knockout: true,  round_name: 'Round of 32',    round_order: 2, tab_group: 'r32',     predict_mode: 'outcome', result_pts:  5, exact_bonus: 0, margin_bonus: 0, pen_bonus: 5, fav_team_2x: false, include_in_scoring: true },
    { id: 'r16',  tournament_id: 'default', round_code: 'r16',  is_knockout: true,  round_name: 'Round of 16',    round_order: 3, tab_group: 'r16',     predict_mode: 'outcome', result_pts:  7, exact_bonus: 0, margin_bonus: 0, pen_bonus: 5, fav_team_2x: false, include_in_scoring: true },
    { id: 'qf',   tournament_id: 'default', round_code: 'qf',   is_knockout: true,  round_name: 'Quarter-finals', round_order: 4, tab_group: 'qf',      predict_mode: 'outcome', result_pts: 10, exact_bonus: 0, margin_bonus: 0, pen_bonus: 5, fav_team_2x: false, include_in_scoring: true },
    { id: 'sf',   tournament_id: 'default', round_code: 'sf',   is_knockout: true,  round_name: 'Semi-finals',    round_order: 5, tab_group: 'sf',      predict_mode: 'score',   result_pts: 15, exact_bonus: 5, margin_bonus: 5, pen_bonus: 5, fav_team_2x: false, include_in_scoring: true },
    { id: 'tp',   tournament_id: 'default', round_code: 'tp',   is_knockout: true,  round_name: '3rd Place',      round_order: 6, tab_group: 'finals',  predict_mode: 'score',   result_pts:  5, exact_bonus: 5, margin_bonus: 5, pen_bonus: 5, fav_team_2x: false, include_in_scoring: true },
    { id: 'f',    tournament_id: 'default', round_code: 'f',    is_knockout: true,  round_name: 'Final',          round_order: 7, tab_group: 'finals',  predict_mode: 'score',   result_pts: 25, exact_bonus: 5, margin_bonus: 5, pen_bonus: 5, fav_team_2x: false, include_in_scoring: true },
  ])
}

// ─── Entity types ─────────────────────────────────────────────────────────────

export interface Fixture {
  id:          number
  round:       RoundId
  tab_group:   string
  group?:      string
  home:        string
  away:        string
  kickoff_utc: string
  venue:       string
  tournament_id?: string
  result?:     MatchScore & { pen_winner?: string | null; result_outcome?: string | null }
}

export interface MatchScore {
  home: number
  away: number
}

export interface Prediction {
  fixture_id:       number
  user_id:          string
  home:             number
  away:             number
  outcome?:         'H' | 'D' | 'A' | null
  pen_winner?:      string | null
  created_at:       string
  updated_at:       string
  points_earned?:   number
  standard_points?: number
  bonus_points?:    number
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
  total_points: number; total_bonus_points?: number
  bonus_count: number; correct_count: number
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

    if (isExactScore) {
      const drewAndPens = result.home === result.away && !!result.pen_winner
      const penCorrect  = drewAndPens && rc.pen_bonus > 0 && pred.pen_winner === result.pen_winner
      // fav_team_2x applies to base result_pts only
      return rc.result_pts * multiplier + rc.exact_bonus + (penCorrect ? rc.pen_bonus : 0)
    }
    if (predOutcome !== resultOutcome) return 0

    // Correct result but not exact: check margin bonus
    const predMargin   = Math.abs((pred.home ?? 0) - (pred.away ?? 0))
    const resultMargin = Math.abs(result.home - result.away)
    const marginBonus  = rc.margin_bonus > 0 && predMargin === resultMargin ? rc.margin_bonus : 0

    const drewAndPens = result.home === result.away && !!result.pen_winner
    const penCorrect  = drewAndPens && rc.pen_bonus > 0 && pred.pen_winner === result.pen_winner
    // fav_team_2x applies to base result_pts only
    return rc.result_pts * multiplier + marginBonus + (penCorrect ? rc.pen_bonus : 0)

  } else {
    // Outcome-only rounds (gs / r32 / r16 / qf)
    const predOutcome   = pred.outcome ?? getOutcome(pred.home ?? 0, pred.away ?? 0)
    const resultOutcome = result.result_outcome ?? getOutcome(result.home, result.away)
    if (predOutcome !== resultOutcome) return 0

    // Pen bonus: scores level (draw) + pen winner stored + prediction matches
    // Use BOTH resultOutcome === 'D' AND scores comparison as fallback
    const isScoresDraw = result.home === result.away
    const penCorrect = rc.pen_bonus > 0
      && (resultOutcome === 'D' || isScoresDraw)
      && !!result.pen_winner
      && !!pred.pen_winner
      && pred.pen_winner === result.pen_winner
    // fav_team_2x applies to base result_pts only (pen bonus always flat)
    return rc.result_pts * multiplier + (penCorrect ? rc.pen_bonus : 0)
  }
}
