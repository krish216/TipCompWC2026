// Bracket Challenge scoring. Each correctly-predicted knockout winner scores its
// round's points, independently per slot:
//   R32 ×16 @1 · R16 ×8 @2 · QF ×4 @4 · SF ×2 @8 · 3rd ×1 @4 · Final ×1 @12  → max 80.
//
// Slot keys (from bracket_picks): r32:1..16, r16:1..8, qf:1..4, sf:1..2, tp, final.
// Actual winners are derived from the knockout fixtures: within each round, the
// Nth fixture by kickoff is slot N (verified — placeholder fixtures are seeded as
// "TBD R32-1 v TBD R32-2" in bracket order). 'tp' = 3rd-place match, 'final' = the
// Final (its winner = champion).

export type BracketRound = 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'final'

export const BRACKET_SLOT_POINTS: Record<BracketRound, number> = {
  r32: 1, r16: 2, qf: 4, sf: 8, tp: 4, final: 12,
}
export const BRACKET_MAX = 80

// Every scored slot, in order, with its round.
export const SCORED_SLOTS: { slot: string; round: BracketRound }[] = [
  ...Array.from({ length: 16 }, (_, i) => ({ slot: `r32:${i + 1}`, round: 'r32' as const })),
  ...Array.from({ length: 8  }, (_, i) => ({ slot: `r16:${i + 1}`, round: 'r16' as const })),
  ...Array.from({ length: 4  }, (_, i) => ({ slot: `qf:${i + 1}`,  round: 'qf'  as const })),
  ...Array.from({ length: 2  }, (_, i) => ({ slot: `sf:${i + 1}`,  round: 'sf'  as const })),
  { slot: 'tp',    round: 'tp' },
  { slot: 'final', round: 'final' },
]

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase()

export interface KnockoutFixture {
  round: string
  kickoff_utc: string
  home: string
  away: string
  home_score: number | null
  away_score: number | null
  pen_winner: string | null
  bracket_slot?: string | null   // 'r32:1'… — explicit slot (preferred over kickoff order)
}

// Assign each knockout fixture to its bracket slot. Prefers the explicit
// `bracket_slot` column; for any round that has NO explicitly-slotted fixtures it
// falls back to the legacy "Nth fixture by kickoff = slot N" (back-compat for
// pre-126 data / non-WC tournaments). Never mixes the two within a round.
function assignSlots(fixtures: KnockoutFixture[]): Map<KnockoutFixture, string> {
  const m = new Map<KnockoutFixture, string>()
  const roundsWithExplicit = new Set<string>()
  for (const f of fixtures) if (f.bracket_slot) { m.set(f, f.bracket_slot); roundsWithExplicit.add(f.round) }

  const legacy: Record<string, KnockoutFixture[]> = {}
  for (const f of fixtures) if (!f.bracket_slot && !roundsWithExplicit.has(f.round)) (legacy[f.round] ??= []).push(f)
  const prefixOf: Record<string, string> = { r32: 'r32', r16: 'r16', qf: 'qf', sf: 'sf' }
  for (const round of Object.keys(legacy)) {
    const sorted = legacy[round].slice().sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime())
    if (round === 'tp') { if (sorted[0]) m.set(sorted[0], 'tp'); continue }
    if (round === 'f')  { if (sorted[0]) m.set(sorted[0], 'final'); continue }
    const prefix = prefixOf[round]; if (!prefix) continue
    sorted.forEach((f, i) => m.set(f, `${prefix}:${i + 1}`))
  }
  return m
}

// Winner team name from a knockout fixture, or null if no result yet.
export function fixtureWinner(fx: KnockoutFixture): string | null {
  if (fx.home_score == null || fx.away_score == null) return null
  if (fx.home_score > fx.away_score) return fx.home
  if (fx.away_score > fx.home_score) return fx.away
  return fx.pen_winner ?? null // draw → decided on penalties
}

// slot_key → actual winner, for matches that have a result.
export function buildActualWinners(fixtures: KnockoutFixture[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [f, slot] of assignSlots(fixtures)) { const w = fixtureWinner(f); if (w) out[slot] = w }
  return out
}

// Per-slot fixture detail for the match-by-match scorecard: the actual winner,
// the team they beat, and whether the match has been played. Mirrors the same
// kickoff-order slot mapping as buildActualWinners.
export interface SlotResult {
  winner: string | null   // actual winner of the slot (null if not played)
  loser:  string | null   // the team they beat (for "X def. Y")
  played: boolean         // the match has a result
}

export function buildSlotResults(fixtures: KnockoutFixture[]): Record<string, SlotResult> {
  const detail = (f: KnockoutFixture): SlotResult => {
    const w = fixtureWinner(f)
    const played = f.home_score != null && f.away_score != null
    const loser = w ? (norm(w) === norm(f.home) ? f.away : f.home) : null
    return { winner: w, loser, played }
  }
  const out: Record<string, SlotResult> = {}
  for (const [f, slot] of assignSlots(fixtures)) out[slot] = detail(f)
  return out
}

export interface BracketScore {
  total:   number
  byRound: Record<BracketRound, number>
  correct: Record<BracketRound, number>
}

export function scoreBracket(picks: Record<string, string | null>, actual: Record<string, string>): BracketScore {
  const byRound: Record<BracketRound, number> = { r32: 0, r16: 0, qf: 0, sf: 0, tp: 0, final: 0 }
  const correct: Record<BracketRound, number> = { r32: 0, r16: 0, qf: 0, sf: 0, tp: 0, final: 0 }
  for (const { slot, round } of SCORED_SLOTS) {
    const a = actual[slot]
    const p = picks[slot]
    if (a && p && norm(a) === norm(p)) { byRound[round] += BRACKET_SLOT_POINTS[round]; correct[round]++ }
  }
  const total = (Object.values(byRound) as number[]).reduce((s, n) => s + n, 0)
  return { total, byRound, correct }
}
