import { calcPoints, getOutcome, SCORING } from '@/types/index'

// ─── getOutcome ───────────────────────────────────────────────────────────────
describe('getOutcome', () => {
  it('returns H for home win', ()  => expect(getOutcome(2, 0)).toBe('H'))
  it('returns A for away win', ()  => expect(getOutcome(0, 1)).toBe('A'))
  it('returns D for draw', ()      => expect(getOutcome(1, 1)).toBe('D'))
  it('handles large scores', ()    => expect(getOutcome(10, 3)).toBe('H'))
})

// ─── calcPoints ──────────────────────────────────────────────────────────────
describe('calcPoints — group stage (result:3, exact:5)', () => {
  const round = 'gs' as const

  it('returns null when no result yet', () =>
    expect(calcPoints({ home: 2, away: 1 }, null, round)).toBeNull())

  it('returns 0 when no prediction', () =>
    expect(calcPoints(null, { home: 2, away: 1 }, round)).toBe(0))

  it('scores 5 for exact score', () =>
    expect(calcPoints({ home: 2, away: 1 }, { home: 2, away: 1 }, round)).toBe(5))

  it('scores 3 for correct result (home win, wrong score)', () =>
    expect(calcPoints({ home: 3, away: 0 }, { home: 2, away: 1 }, round)).toBe(3))

  it('scores 3 for correct draw', () =>
    expect(calcPoints({ home: 0, away: 0 }, { home: 1, away: 1 }, round)).toBe(3))

  it('scores 0 for wrong result', () =>
    expect(calcPoints({ home: 1, away: 0 }, { home: 0, away: 2 }, round)).toBe(0))

  it('scores 0 for predicted draw but home won', () =>
    expect(calcPoints({ home: 1, away: 1 }, { home: 2, away: 0 }, round)).toBe(0))
})

describe('calcPoints — escalating rounds', () => {
  const result = { home: 1, away: 0 }
  const exactPred = { home: 1, away: 0 }
  const resultPred = { home: 2, away: 0 }
  const wrongPred = { home: 0, away: 1 }

  const cases: Array<[string, number, number]> = [
    ['gs',  5,  3],
    ['r32', 8,  5],
    ['r16', 10, 7],
    ['qf',  14, 10],
    ['sf',  20, 15],
    ['tp',  25, 20],
    ['f',   30, 25],
  ]

  cases.forEach(([round, exactPts, resultPts]) => {
    it(`${round}: exact=${exactPts}, result=${resultPts}`, () => {
      expect(calcPoints(exactPred, result, round as any)).toBe(exactPts)
      expect(calcPoints(resultPred, result, round as any)).toBe(resultPts)
      expect(calcPoints(wrongPred, result, round as any)).toBe(0)
    })
  })
})

// ─── SCORING config sanity checks ────────────────────────────────────────────
describe('SCORING config', () => {
  it('exact always greater than result', () => {
    Object.values(SCORING).forEach(sc => {
      expect(sc.exact).toBeGreaterThan(sc.result)
    })
  })

  it('points increase with round progression', () => {
    const rounds = ['gs', 'r32', 'r16', 'qf', 'sf', 'tp', 'f'] as const
    for (let i = 1; i < rounds.length; i++) {
      expect(SCORING[rounds[i]].exact).toBeGreaterThanOrEqual(SCORING[rounds[i-1]].exact)
      expect(SCORING[rounds[i]].result).toBeGreaterThanOrEqual(SCORING[rounds[i-1]].result)
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
