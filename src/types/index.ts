// ─── Domain types ────────────────────────────────────────────────────────────

export type RoundId = 'gs' | 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'f'
export type RoundTab = 'gs' | 'r32' | 'r16' | 'qf' | 'sf' | 'finals'
export const FINALS_ROUNDS:      RoundId[] = ['tp', 'f']
export const KNOCKOUT_ROUNDS:    RoundId[] = ['r32','r16','qf','sf','tp','f']
export const EXACT_SCORE_ROUNDS: RoundId[] = ['sf','tp','f']   // player predicts score
export const OUTCOME_ROUNDS:     RoundId[] = ['gs','r32','r16','qf']  // player picks 1/X/2
// Bonus rules
export const PEN_BONUS_ROUNDS:   RoundId[] = ['r32','r16','qf','sf','tp','f'] // +5 for correct pen winner
export const EXACT_BONUS_ROUNDS: RoundId[] = ['sf','tp','f']   // +5 bonus on top of result pts when exact

export const PEN_BONUS_PTS   = 5
export const EXACT_BONUS_PTS = 5

export interface ScoringRule {
  result: number
  exact: number  // kept for display/rules reference; calcPoints uses result + EXACT_BONUS_PTS
  label: string
}

export const SCORING: Record<RoundId, ScoringRule> = {
  gs:  { result: 3,  exact: 5,  label: 'Group stage'    },
  r32: { result: 5,  exact: 8,  label: 'Round of 32'    },
  r16: { result: 7,  exact: 10, label: 'Round of 16'    },
  qf:  { result: 10, exact: 14, label: 'Quarter-finals'  },
  sf:  { result: 15, exact: 20, label: 'Semi-finals'     },
  tp:  { result:  5, exact: 10, label: 'Finals weekend'  },
  f:   { result: 25, exact: 30, label: 'Finals weekend'  },
}

export interface Fixture {
  id: number
  round: RoundId
  group?: string
  home: string
  away: string
  date: string
  kickoff_utc: string
  venue: string
  result?: MatchScore
}

export interface MatchScore {
  home: number
  away: number
}

export interface Prediction {
  fixture_id:    number
  user_id:       string
  home:          number
  away:          number
  outcome?:      'H' | 'D' | 'A' | null
  pen_winner?:   string | null
  created_at:    string
  updated_at:    string
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
  total_points: number; exact_count: number; correct_count: number
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

export const FAV_TEAM_DOUBLE_ROUNDS: RoundId[] = ['gs', 'r32']

export function calcPoints(
  pred:   Pick<Prediction, 'home' | 'away' | 'pen_winner' | 'outcome'> | null | undefined,
  result: (MatchScore & { pen_winner?: string | null; result_outcome?: string | null }) | null | undefined,
  round:  RoundId,
  isFavourite = false
): number | null {
  if (!result) return null
  if (!pred)   return 0

  const sc         = SCORING[round]
  const multiplier = isFavourite && FAV_TEAM_DOUBLE_ROUNDS.includes(round) ? 2 : 1
  const isExact    = EXACT_SCORE_ROUNDS.includes(round)

  if (isExact) {
    // sf, tp, f — predict exact score
    // Points: result pts for correct outcome; result pts + 5 bonus for exact score
    const resultOutcome   = getOutcome(result.home, result.away)
    const predOutcome     = getOutcome(pred.home, pred.away)
    const isExactScore    = pred.home === result.home && pred.away === result.away
    const isCorrectResult = predOutcome === resultOutcome

    if (isExactScore) {
      // Correct exact score = result points + 5 bonus (no separate "exact" tier)
      return (sc.result + EXACT_BONUS_PTS) * multiplier
    }
    if (isCorrectResult) return sc.result * multiplier
    return 0
  } else {
    // gs, r32, r16, qf — pick outcome only
    const predOutcome   = pred.outcome ?? getOutcome(pred.home ?? 0, pred.away ?? 0)
    const resultOutcome = result.result_outcome ?? getOutcome(result.home, result.away)
    if (predOutcome !== resultOutcome) return 0

    // Correct outcome
    let pts = sc.result
    // Penalty bonus: +5 for correct pen winner (r32+)
    if (
      PEN_BONUS_ROUNDS.includes(round) &&
      resultOutcome === 'D' &&
      result.pen_winner &&
      pred.pen_winner === result.pen_winner
    ) {
      pts += PEN_BONUS_PTS
    }
    return pts * multiplier
  }
}
