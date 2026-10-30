import { autoDrawAt, drawForUnlocksAt, fmtLeft } from '@/lib/sweep/grace'

describe('sweep 2-hour spin window', () => {
  const H = 60 * 60 * 1000

  it('runs 2 hours from the ticket grant when the draw was already open', () => {
    const at = drawForUnlocksAt('2026-11-01T01:00:00Z', '2026-10-31T08:00:00Z')
    expect(at?.toISOString()).toBe(new Date(Date.parse('2026-11-01T01:00:00Z') + 2 * H).toISOString())
  })

  it('runs 2 hours from the draw opening for tickets bought before it', () => {
    const at = drawForUnlocksAt('2026-10-28T01:00:00Z', '2026-10-31T08:00:00Z')
    expect(at?.toISOString()).toBe('2026-10-31T10:00:00.000Z')
  })

  it('falls back to the grant time when the opening time is unknown', () => {
    expect(drawForUnlocksAt('2026-10-31T08:00:00Z', null)?.toISOString()).toBe('2026-10-31T10:00:00.000Z')
    expect(drawForUnlocksAt(null, null)).toBeNull()
  })

  it('auto-draws 30 minutes before the race', () => {
    expect(autoDrawAt('2026-11-03T04:00:00Z')?.toISOString()).toBe('2026-11-03T03:30:00.000Z')
    expect(autoDrawAt(null)).toBeNull()
  })

  it('formats the countdown', () => {
    expect(fmtLeft(102 * 60_000)).toBe('1h 42m')
    expect(fmtLeft(12 * 60_000)).toBe('12m')
    expect(fmtLeft(10_000)).toBe('1m')
  })
})
