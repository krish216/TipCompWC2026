import { newRun, scramble, FIXED, MEDIUM, HARD, DRAW, CODES, STEP } from './petzbff-quiz'

describe('petzbff quiz bank', () => {
  it('every question has 4 distinct options and a valid answer index', () => {
    for (const q of [...FIXED, ...MEDIUM, ...HARD]) {
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      expect(q.a).toBeGreaterThanOrEqual(0)
      expect(q.a).toBeLessThan(4)
      expect(q.why).toBeTruthy()
    }
  })

  it('no question appears in more than one pool', () => {
    const all = [...FIXED, ...MEDIUM, ...HARD].map(q => q.q)
    expect(new Set(all).size).toBe(all.length)
  })

  it('a run is exactly 10 questions and tops out at 30%', () => {
    expect(FIXED.length + DRAW.medium + DRAW.hard).toBe(10)
    expect(10 * STEP).toBe(30)
    expect(CODES[30]).toBe('QNeve30')
  })

  it('scramble never breaks the answer', () => {
    for (const q of [...FIXED, ...MEDIUM, ...HARD]) {
      const correctText = q.options[q.a]
      for (let i = 0; i < 200; i++) {
        const s = scramble(q)
        expect(s.options[s.a]).toBe(correctText)
        expect(new Set(s.options).size).toBe(4)
      }
    }
  })

  it('runs are well formed over many draws', () => {
    const mediumQs = new Set(MEDIUM.map(q => q.q))
    const hardQs = new Set(HARD.map(q => q.q))
    const tails = new Set<string>()

    for (let i = 0; i < 2000; i++) {
      const run = newRun()
      expect(run).toHaveLength(10)
      const texts = run.map(q => q.q)
      expect(new Set(texts).size).toBe(10)                          // no duplicates in a run
      FIXED.forEach((q, n) => expect(texts[n]).toBe(q.q))           // easy ladder stays put
      texts.slice(5, 7).forEach(t => expect(mediumQs.has(t)).toBe(true))
      texts.slice(7, 10).forEach(t => expect(hardQs.has(t)).toBe(true))
      run.forEach(q => expect(q.options[q.a]).toBeTruthy())
      tails.add(texts.slice(5).sort().join('|'))
    }
    // The whole point of the pools: a replayer should not see the same tail twice.
    expect(tails.size).toBeGreaterThan(500)
  })

  it('every reachable score maps to a real discount code', () => {
    for (let correct = 0; correct <= 10; correct++) {
      const pct = Math.max(STEP, correct * STEP)
      expect(CODES[pct]).toBeTruthy()
    }
  })
})
