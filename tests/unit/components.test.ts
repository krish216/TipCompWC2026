/**
 * Component tests — run with: npm test
 * Uses @testing-library/react + jest-dom
 */

// ── Scoring helpers (pure logic, no React needed) ─────────────────────────────
import { calcPoints, getOutcome, getDefaultScoringConfig } from '../../src/types/index'

const SCORING_CONFIG = getDefaultScoringConfig()

describe('calcPoints — component integration', () => {
  it('returns null when no result', () => {
    expect(calcPoints({ home: 1, away: 0 }, null, 'gs')).toBeNull()
  })

  it('returns 0 for no prediction with a result', () => {
    expect(calcPoints(null, { home: 2, away: 1 }, 'gs')).toBe(0)
  })

  it('exact score across all rounds', () => {
    const result = { home: 2, away: 1 }
    const pred   = { home: 2, away: 1 }
    expect(calcPoints(pred, result, 'gs')).toBe(5)
    expect(calcPoints(pred, result, 'r32')).toBe(8)
    expect(calcPoints(pred, result, 'r16')).toBe(10)
    expect(calcPoints(pred, result, 'qf')).toBe(14)
    expect(calcPoints(pred, result, 'sf')).toBe(20)
    expect(calcPoints(pred, result, 'tp')).toBe(25)
    expect(calcPoints(pred, result, 'f')).toBe(30)
  })

  it('correct result across all rounds', () => {
    const result = { home: 2, away: 1 }
    const pred   = { home: 3, away: 0 }   // home win, wrong score
    expect(calcPoints(pred, result, 'gs')).toBe(3)
    expect(calcPoints(pred, result, 'r32')).toBe(5)
    expect(calcPoints(pred, result, 'r16')).toBe(7)
    expect(calcPoints(pred, result, 'qf')).toBe(10)
    expect(calcPoints(pred, result, 'sf')).toBe(15)
    expect(calcPoints(pred, result, 'tp')).toBe(20)
    expect(calcPoints(pred, result, 'f')).toBe(25)
  })

  it('wrong result = 0 in every round', () => {
    const result = { home: 0, away: 2 }
    const pred   = { home: 2, away: 0 }
    const rounds = ['gs','r32','r16','qf','sf','tp','f'] as const
    rounds.forEach(r => expect(calcPoints(pred, result, r)).toBe(0))
  })
})

// ── Lockout helper ────────────────────────────────────────────────────────────
describe('Prediction lockout', () => {
  function isLocked(kickoff: string, now = new Date()) {
    return (new Date(kickoff).getTime() - now.getTime()) / 60000 <= 5
  }

  it('is locked 0 mins before kickoff',   () => expect(isLocked(new Date().toISOString())).toBe(true))
  it('is locked 4 mins before kickoff',   () => expect(isLocked(new Date(Date.now() + 4*60000).toISOString())).toBe(true))
  it('is locked exactly 5 mins before',   () => expect(isLocked(new Date(Date.now() + 5*60000).toISOString())).toBe(true))
  it('is NOT locked 6 mins before',       () => expect(isLocked(new Date(Date.now() + 6*60000).toISOString())).toBe(false))
  it('is NOT locked 60 mins before',      () => expect(isLocked(new Date(Date.now() + 60*60000).toISOString())).toBe(false))
  it('is locked for a past match',        () => expect(isLocked('2026-06-11T19:00:00Z')).toBe(true))
})

// ── SCORING config validation ─────────────────────────────────────────────────
describe('SCORING config', () => {
  const rounds = ['gs','r32','r16','qf','sf','tp','f'] as const

  it('has all 7 rounds defined', () => {
    rounds.forEach(r => expect(SCORING_CONFIG.rounds[r]).toBeDefined())
  })

  it('exact always >= result in every round', () => {
    rounds.forEach(r => expect(SCORING_CONFIG.rounds[r].exact_bonus).toBeGreaterThanOrEqual(0))
  })

  it('points escalate across rounds', () => {
    for (let i = 1; i < rounds.length; i++) {
      expect(SCORING_CONFIG.rounds[rounds[i]].result_pts).toBeGreaterThanOrEqual(SCORING_CONFIG.rounds[rounds[i-1]].result_pts)
    }
  })

  it('final has highest points', () => {
    expect(SCORING_CONFIG.rounds.f.result_pts).toBe(25)
  })
})

// ── Tribe invite code validation ──────────────────────────────────────────────
describe('Invite code validation', () => {
  const isValid = (code: string) => /^[A-Z0-9]{8}$/.test(code)

  it('accepts valid 8-char uppercase alphanumeric', () => {
    expect(isValid('XJAB4K89')).toBe(true)
    expect(isValid('AAAAAAAA')).toBe(true)
    expect(isValid('12345678')).toBe(true)
  })

  it('rejects lowercase letters',       () => expect(isValid('xjab4k89')).toBe(false))
  it('rejects 7-char code',             () => expect(isValid('XJAB4K8')).toBe(false))
  it('rejects 9-char code',             () => expect(isValid('XJAB4K899')).toBe(false))
  it('rejects special characters',      () => expect(isValid('XJAB-K89')).toBe(false))
  it('rejects spaces',                  () => expect(isValid('XJAB K89')).toBe(false))
  it('rejects empty string',            () => expect(isValid('')).toBe(false))
})

// ── Chat message validation ───────────────────────────────────────────────────
describe('Chat message validation', () => {
  const isValid = (content: string) => content.trim().length >= 1 && content.trim().length <= 1000

  it('accepts normal message',                () => expect(isValid('Hello tribe!')).toBe(true))
  it('accepts single character',             () => expect(isValid('!')).toBe(true))
  it('accepts 1000 char message',            () => expect(isValid('a'.repeat(1000))).toBe(true))
  it('rejects empty string',                 () => expect(isValid('')).toBe(false))
  it('rejects whitespace-only',              () => expect(isValid('   ')).toBe(false))
  it('rejects message over 1000 chars',      () => expect(isValid('a'.repeat(1001))).toBe(false))
})

// ── Leaderboard rank calculation ──────────────────────────────────────────────
describe('Leaderboard ranking', () => {
  interface Entry { user_id: string; total_points: number; exact_count: number }

  function rankEntries(entries: Entry[]) {
    return [...entries]
      .sort((a, b) => b.total_points - a.total_points || b.exact_count - a.exact_count)
      .map((e, i) => ({ ...e, rank: i + 1 }))
  }

  it('sorts by total points descending', () => {
    const ranked = rankEntries([
      { user_id: 'a', total_points: 10, exact_count: 2 },
      { user_id: 'b', total_points: 30, exact_count: 1 },
      { user_id: 'c', total_points: 20, exact_count: 3 },
    ])
    expect(ranked[0].user_id).toBe('b')
    expect(ranked[1].user_id).toBe('c')
    expect(ranked[2].user_id).toBe('a')
  })

  it('breaks ties by exact_count', () => {
    const ranked = rankEntries([
      { user_id: 'a', total_points: 20, exact_count: 1 },
      { user_id: 'b', total_points: 20, exact_count: 3 },
    ])
    expect(ranked[0].user_id).toBe('b')
  })

  it('assigns correct rank numbers', () => {
    const ranked = rankEntries([
      { user_id: 'a', total_points: 5,  exact_count: 1 },
      { user_id: 'b', total_points: 15, exact_count: 2 },
      { user_id: 'c', total_points: 10, exact_count: 3 },
    ])
    expect(ranked.find(r => r.user_id === 'b')!.rank).toBe(1)
    expect(ranked.find(r => r.user_id === 'c')!.rank).toBe(2)
    expect(ranked.find(r => r.user_id === 'a')!.rank).toBe(3)
  })
})

// ── Round stats calculation ───────────────────────────────────────────────────
describe('Round stats calculation', () => {
  type PredMap   = Record<number, { home: number; away: number }>
  type ResultMap = Record<number, { home: number; away: number }>

  function calcRoundStats(fixtureIds: number[], round: 'gs', preds: PredMap, results: ResultMap) {
    const rc = SCORING_CONFIG.rounds[round]
    const exactPoints = rc.result_pts + rc.exact_bonus
    let pts = 0, exact = 0, correct = 0, played = 0
    fixtureIds.forEach(id => {
      const r = results[id]; if (!r) return
      played++
      const p = preds[id]
      if (!p) return
      const v = calcPoints(p, r, round, false, SCORING_CONFIG)
      if (v === null) return
      pts += v
      if (v === exactPoints) exact++
      else if (v === rc.result_pts && v > 0) correct++
    })
    return { pts, exact, correct, played }
  }

  it('calculates group stage round stats correctly', () => {
    const preds   = { 1: { home: 2, away: 1, outcome: 'H' }, 2: { home: 0, away: 0, outcome: 'D' }, 3: { home: 1, away: 0, outcome: 'H' } }
    const results = { 1: { home: 2, away: 1, result_outcome: 'H' }, 2: { home: 1, away: 1, result_outcome: 'D' }, 3: { home: 0, away: 2, result_outcome: 'A' } }
    const stats   = calcRoundStats([1, 2, 3], 'gs', preds, results)
    expect(stats.played).toBe(3)
    expect(stats.correct).toBe(2)  // fixtures 1 and 2 (both correct outcome)
    expect(stats.pts).toBe(3 + 3)  // result_pts=3 for each correct prediction
  })

  it('handles fixtures with no prediction as 0 pts', () => {
    const preds   = {}
    const results = { 1: { home: 1, away: 0 } }
    const stats   = calcRoundStats([1], 'gs', preds, results)
    expect(stats.pts).toBe(0)
    expect(stats.exact).toBe(0)
    expect(stats.played).toBe(1)
  })

  it('handles no results yet', () => {
    const preds   = { 1: { home: 1, away: 0 } }
    const results = {}
    const stats   = calcRoundStats([1], 'gs', preds, results)
    expect(stats.played).toBe(0)
    expect(stats.pts).toBe(0)
  })
})
