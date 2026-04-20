import { calcPoints, getOutcome, getDefaultScoringConfig } from '@/types/index'

// ─── getOutcome ───────────────────────────────────────────────────────────────
describe('getOutcome', () => {
  it('returns H for home win', ()  => expect(getOutcome(2, 0)).toBe('H'))
  it('returns A for away win', ()  => expect(getOutcome(0, 1)).toBe('A'))
  it('returns D for draw', ()      => expect(getOutcome(1, 1)).toBe('D'))
  it('handles large scores', ()    => expect(getOutcome(10, 3)).toBe('H'))
})

// ─── calcPoints ──────────────────────────────────────────────────────────────
describe('calcPoints — group stage (result:3, exact:0)', () => {
  const round = 'gs' as const
  const config = getDefaultScoringConfig()

  it('returns null when no result yet', () =>
    expect(calcPoints({ home: 2, away: 1 }, null, round, false, config)).toBeNull())

  it('returns 0 when no prediction', () =>
    expect(calcPoints(null, { home: 2, away: 1 }, round, false, config)).toBe(0))

  it('scores 3 for correct result outcome (home win, wrong score)', () =>
    expect(calcPoints({ home: 3, away: 0, outcome: 'H' }, { home: 2, away: 1, result_outcome: 'H' }, round, false, config)).toBe(3))

  it('scores 3 for correct draw outcome', () =>
    expect(calcPoints({ home: 0, away: 0, outcome: 'D' }, { home: 1, away: 1, result_outcome: 'D' }, round, false, config)).toBe(3))

  it('scores 0 for wrong outcome', () =>
    expect(calcPoints({ home: 1, away: 0, outcome: 'H' }, { home: 0, away: 2, result_outcome: 'A' }, round, false, config)).toBe(0))
})

describe('calcPoints — escalating rounds', () => {
  const config = getDefaultScoringConfig()
  const result = { home: 1, away: 0, result_outcome: 'H' }
  const exactPred = { home: 1, away: 0 }
  const resultPred = { home: 2, away: 0 }
  const wrongPred = { home: 0, away: 1 }

  const cases: Array<[string, number, number]> = [
    ['gs',  0,  3],   // exact bonus is 0, result pts is 3
    ['r32', 0,  5],   // exact bonus is 0, result pts is 5
    ['r16', 0,  7],   // exact bonus is 0, result pts is 7
    ['qf',  0,  10],  // exact bonus is 0, result pts is 10
    ['sf',  20, 15],  // exact bonus is 5, result pts is 15 (sf is score mode)
    ['tp',  10, 5],   // exact bonus is 5, result pts is 5 (tp is score mode)
    ['f',   30, 25],  // exact bonus is 5, result pts is 25 (f is score mode)
  ]

  cases.forEach(([round, exactPts, resultPts]) => {
    it(`${round}: exact=${exactPts}, result=${resultPts}`, () => {
      const cfg = config.rounds[round as any]
      if (cfg.predict_mode === 'score') {
        expect(calcPoints(exactPred, result, round as any, false, config)).toBe(exactPts)
        expect(calcPoints(resultPred, result, round as any, false, config)).toBe(resultPts)
      } else {
        expect(calcPoints({ ...exactPred, outcome: 'H' }, { ...result, result_outcome: 'H' }, round as any, false, config)).toBe(resultPts)
      }
      expect(calcPoints(wrongPred, result, round as any, false, config)).toBe(0)
    })
  })
})

// ─── SCORING config sanity checks ────────────────────────────────────────────
describe('SCORING config', () => {
  const config = getDefaultScoringConfig()
  
  it('exact bonus plus result pts are reasonable', () => {
    Object.values(config.rounds).forEach(rc => {
      expect(rc.exact_bonus + rc.result_pts).toBeGreaterThan(0)
    })
  })

  it('points increase with round progression', () => {
    const rounds = ['gs', 'r32', 'r16', 'qf', 'sf', 'tp', 'f'] as const
    for (let i = 1; i < rounds.length; i++) {
      const prev = config.rounds[rounds[i-1]]
      const curr = config.rounds[rounds[i]]
      expect(curr.result_pts).toBeGreaterThanOrEqual(prev.result_pts)
    }
  })
})

// ─── Lockout logic ────────────────────────────────────────────────────────────
describe('Prediction lockout', () => {
  function isLocked(kickoffUtc: string, nowOverride?: Date): boolean {
    const now = nowOverride ?? new Date()
    const kickoff = new Date(kickoffUtc)
    const minsToKickoff = (kickoff.getTime() - now.getTime()) / 60000
    return minsToKickoff <= 5
  }

  it('locks when kickoff is in the past', () => {
    expect(isLocked('2020-01-01T12:00:00Z')).toBe(true)
  })

  it('locks exactly at 5 minute mark', () => {
    const fiveMinsFromNow = new Date(Date.now() + 5 * 60 * 1000)
    expect(isLocked(fiveMinsFromNow.toISOString())).toBe(true)
  })

  it('does not lock when kickoff is 6+ mins away', () => {
    const sixMinsFromNow = new Date(Date.now() + 6 * 60 * 1000)
    expect(isLocked(sixMinsFromNow.toISOString())).toBe(false)
  })

  it('locks when kickoff is 1 min away', () => {
    const oneMinFromNow = new Date(Date.now() + 1 * 60 * 1000)
    expect(isLocked(oneMinFromNow.toISOString())).toBe(true)
  })
})

// ─── Tribe invite code format ─────────────────────────────────────────────────
describe('Tribe invite code', () => {
  const INVITE_CODE_RE = /^[A-Z0-9]{8}$/

  it('accepts valid 8-char uppercase code', () => {
    expect(INVITE_CODE_RE.test('XJAB4K89')).toBe(true)
  })

  it('rejects lowercase', ()    => expect(INVITE_CODE_RE.test('xjab4k89')).toBe(false))
  it('rejects short code', ()   => expect(INVITE_CODE_RE.test('XJAB4K8')).toBe(false))
  it('rejects long code', ()    => expect(INVITE_CODE_RE.test('XJAB4K899')).toBe(false))
  it('rejects special chars', ()=> expect(INVITE_CODE_RE.test('XJAB-K89')).toBe(false))
})
