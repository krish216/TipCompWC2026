// Quartered Top-N / Bottom-N table predictor — pure scoring logic (no DB), safe to
// import anywhere. A user predicts which teams sit in the top and bottom buckets of
// the league table at each quarter's checkpoint; we score set-membership (order-
// independent) against the actual table computed from results.
import type { Team, Fixture } from '@/lib/content/wc'

export interface TableRow {
  team: string; position: number
  played: number; won: number; drawn: number; lost: number
  gf: number; ga: number; gd: number; points: number
}

// Matchweek number from a round code ('r9' → 9). Non-'r' rounds sort last.
const roundNum = (r: string): number => (/^r\d+$/.test(r) ? parseInt(r.slice(1), 10) : NaN)

// The full league table over fixtures up to (and including) a checkpoint round — or
// the whole season when checkpointRound is null. Ranked by points, then GD, then GF.
export function leagueTable(teams: Team[], fixtures: Fixture[], checkpointRound?: string | null): TableRow[] {
  const upto = checkpointRound ? roundNum(checkpointRound) : Infinity
  const rows = new Map<string, TableRow>()
  for (const t of teams) rows.set(t.name, { team: t.name, position: 0, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 })
  for (const f of fixtures) {
    const rn = roundNum(f.round)
    if (Number.isFinite(upto) && (!Number.isFinite(rn) || rn > upto)) continue
    if (f.home_score == null || f.away_score == null) continue
    const h = rows.get(f.home), a = rows.get(f.away)
    if (!h || !a) continue
    h.played++; a.played++
    h.gf += f.home_score; h.ga += f.away_score
    a.gf += f.away_score; a.ga += f.home_score
    if (f.home_score > f.away_score) { h.won++; h.points += 3; a.lost++ }
    else if (f.home_score < f.away_score) { a.won++; a.points += 3; h.lost++ }
    else { h.drawn++; a.drawn++; h.points++; a.points++ }
  }
  for (const r of rows.values()) r.gd = r.gf - r.ga
  const sorted = [...rows.values()].sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team))
  sorted.forEach((r, i) => { r.position = i + 1 })
  return sorted
}

export interface StandingsScore { points: number; topCorrect: string[]; bottomCorrect: string[] }

// Score a prediction: +pts for each predicted team that actually lands in the top-N /
// bottom-N bucket of the table (set membership, order doesn't matter).
export function scoreStandingsPrediction(
  top: string[], bottom: string[], table: TableRow[],
  opts: { topN: number; bottomN: number; pts: number },
): StandingsScore {
  const topActual    = new Set(table.slice(0, opts.topN).map(r => r.team))
  const bottomActual = new Set(table.slice(-opts.bottomN).map(r => r.team))
  const topCorrect    = top.filter(t => topActual.has(t))
  const bottomCorrect = bottom.filter(t => bottomActual.has(t))
  return { points: (topCorrect.length + bottomCorrect.length) * opts.pts, topCorrect, bottomCorrect }
}

// True once every fixture up to the checkpoint round has a result — i.e. the checkpoint
// table is final and the quarter can settle.
export function checkpointComplete(fixtures: Fixture[], checkpointRound: string): boolean {
  const upto = roundNum(checkpointRound)
  const relevant = fixtures.filter(f => { const n = roundNum(f.round); return Number.isFinite(n) && n <= upto })
  return relevant.length > 0 && relevant.every(f => f.home_score != null && f.away_score != null)
}
