// ─── Domain types ────────────────────────────────────────────────────────────

export type RoundId = 'gs' | 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'f'
export type RoundTab = 'gs' | 'r32' | 'r16' | 'qf' | 'sf' | 'finals'  // UI-facing round tabs
export const FINALS_ROUNDS: RoundId[] = ['tp', 'f']
export const KNOCKOUT_ROUNDS: RoundId[] = ['r32','r16','qf','sf','f']  // rounds where draws go to penalties  // both map to the 'finals' tab

export interface ScoringRule {
  result: number
  exact: number
  label: string
}

export const SCORING: Record<RoundId, ScoringRule> = {
  gs:  { result: 3,  exact: 5,  label: 'Group stage'   },
  r32: { result: 5,  exact: 8,  label: 'Round of 32'   },
  r16: { result: 7,  exact: 10, label: 'Round of 16'   },
  qf:  { result: 10, exact: 14, label: 'Quarter-finals' },
  sf:  { result: 15, exact: 20, label: 'Semi-finals'    },
  tp:  { result:  5, exact: 10, label: 'Finals weekend'  },  // 3rd place
  f:   { result: 25, exact: 30, label: 'Finals weekend'  },  // Final
}

export interface Fixture {
  id: number
  round: RoundId
  group?: string          // only gs fixtures
  home: string
  away: string
  date: string            // e.g. "Jun 11"
  kickoff_utc: string     // ISO datetime
  venue: string
  result?: MatchScore     // populated once played
}

export interface MatchScore {
  home: number
  away: number
}

export interface Prediction {
  fixture_id: number
  user_id: string
  home: number
  away: number
  pen_winner?: string | null   // team name — required when draw predicted in knockout round
  created_at: string
  updated_at: string
  points_earned?: number  // null until result confirmed
}

export interface User {
  id: string
  email: string
  display_name: string
  avatar_url?: string
  tribe_id?: string
  created_at: string
}

export interface Tribe {
  id: string
  name: string
  invite_code: string
  created_by: string
  created_at: string
  member_count?: number
}

export interface TribeMember {
  user_id: string
  tribe_id: string
  joined_at: string
  user?: User
}

export interface ChatMessage {
  id: string
  tribe_id: string
  user_id: string
  content: string
  created_at: string
  user?: Pick<User, 'display_name' | 'avatar_url'>
}

export interface LeaderboardEntry {
  user_id: string
  display_name: string
  tribe_name?: string
  total_points: number
  exact_count: number
  correct_count: number
  predictions_made: number
  rank?: number
  round_breakdown?: Record<RoundId, number>
}

// ─── API response shapes ─────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data?: T
  error?: string
  status: number
}

export interface PredictionSubmit {
  fixture_id: number
  home: number
  away: number
}

export interface ResultSubmit {
  fixture_id: number
  home: number
  away: number
}

// ─── Scoring helpers ─────────────────────────────────────────────────────────

export function getOutcome(h: number, a: number): 'H' | 'A' | 'D' {
  if (h > a) return 'H'
  if (a > h) return 'A'
  return 'D'
}

/** Rounds where favourite team earns double points */
export const FAV_TEAM_DOUBLE_ROUNDS: RoundId[] = ['gs', 'r32']

export function calcPoints(
  pred: Pick<Prediction, 'home' | 'away' | 'pen_winner'> | null | undefined,
  result: (MatchScore & { pen_winner?: string | null }) | null | undefined,
  round: RoundId,
  isFavourite = false
): number | null {
  if (!result) return null
  if (!pred) return 0
  const sc         = SCORING[round]
  const multiplier = isFavourite && FAV_TEAM_DOUBLE_ROUNDS.includes(round) ? 2 : 1
  const isKnockout = KNOCKOUT_ROUNDS.includes(round)
  const isDraw     = pred.home === pred.away

  // Exact score: scores match AND penalty winner matches (if draw in knockout)
  if (pred.home === result.home && pred.away === result.away) {
    if (isKnockout && isDraw && result.pen_winner) {
      // Correct penalty winner = exact; wrong = correct result only
      return (pred.pen_winner === result.pen_winner ? sc.exact : sc.result) * multiplier
    }
    return sc.exact * multiplier
  }
  // Correct result (outcome matches)
  if (getOutcome(pred.home, pred.away) === getOutcome(result.home, result.away)) {
    return sc.result * multiplier
  }
  return 0
}
