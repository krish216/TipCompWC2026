// Satirical "Round Debrief" — a per-tribe wrap-up of a single round (default the
// group-stage opener, gs1), in the same Office-of-Competitive-Integrity spirit as
// the weekly report. Pure function — safe to import from server routes and client.

export interface DebriefAward {
  emoji:  string
  title:  string
  winner: string | null   // member name, or null for tribe-wide awards
  detail: string
}
export interface RoundDebriefData {
  round_code:   string
  round_name:   string
  tribe_name:   string
  member_count: number
  played:       boolean    // the round has at least one scored fixture
  awards:       DebriefAward[]
  stats:        { tippers: number; total_members: number; total_points: number; accuracy_pct: number; verdict: string }
}

type Member  = { user_id: string; name: string }
type Fixture = { id: number; home: string; away: string; home_score: number | null; away_score: number | null; pen_winner?: string | null }
type Pred    = { user_id: string; fixture_id: number; home: number; away: number; points_earned: number | null }

const outcome = (h: number, a: number): 'H' | 'D' | 'A' => (h > a ? 'H' : a > h ? 'A' : 'D')
const winnerOf = (f: Fixture): string | null => {
  const h = f.home_score as number, a = f.away_score as number
  return h > a ? f.home : a > h ? f.away : (f.pen_winner ?? null)
}

export function buildRoundDebrief(
  roundCode: string, roundName: string, tribeName: string,
  members: Member[], fixtures: Fixture[], preds: Pred[],
): RoundDebriefData {
  const scored = fixtures.filter(f => f.home_score != null && f.away_score != null)
  const played = scored.length > 0
  const actual: Record<number, 'H' | 'D' | 'A'> = {}
  scored.forEach(f => { actual[f.id] = outcome(f.home_score as number, f.away_score as number) })
  const scoredIds = new Set(scored.map(f => f.id))

  const agg: Record<string, { pts: number; correct: number; tipped: number }> = {}
  members.forEach(m => { agg[m.user_id] = { pts: 0, correct: 0, tipped: 0 } })
  const fxWrong: Record<number, number> = {}
  const fxRight: Record<number, number> = {}
  scored.forEach(f => { fxWrong[f.id] = 0; fxRight[f.id] = 0 })
  const memberRightFx: Record<string, Set<number>> = {}

  for (const p of preds) {
    if (!scoredIds.has(p.fixture_id) || !agg[p.user_id]) continue
    agg[p.user_id].tipped++
    agg[p.user_id].pts += Number(p.points_earned ?? 0)
    if (outcome(p.home, p.away) === actual[p.fixture_id]) {
      agg[p.user_id].correct++
      fxRight[p.fixture_id]++
      ;(memberRightFx[p.user_id] ??= new Set()).add(p.fixture_id)
    } else {
      fxWrong[p.fixture_id]++
    }
  }

  const tippers = members.filter(m => agg[m.user_id].tipped > 0)
  const ghosts  = members.filter(m => agg[m.user_id].tipped === 0)
  const awards: DebriefAward[] = []

  // 🏆 MVP — most points
  const byPts = [...tippers].sort((a, b) => agg[b.user_id].pts - agg[a.user_id].pts || agg[b.user_id].correct - agg[a.user_id].correct)
  const mvp = byPts[0]
  if (mvp && agg[mvp.user_id].pts > 0) {
    awards.push({ emoji: '🏆', title: 'Round MVP', winner: mvp.name, detail: `${agg[mvp.user_id].pts} pts — the sharpest crystal ball in the tribe.` })
  }

  // 🎯 Sharpshooter — most correct results (only if it's someone other than the MVP)
  const sharp = [...tippers].sort((a, b) => agg[b.user_id].correct - agg[a.user_id].correct)[0]
  if (sharp && agg[sharp.user_id].correct > 0 && sharp.user_id !== mvp?.user_id) {
    awards.push({ emoji: '🎯', title: 'Sharpshooter', winner: sharp.name, detail: `${agg[sharp.user_id].correct}/${scored.length} results called.` })
  }

  // 🎲 The Maverick — correctly called the fixture the tribe most got wrong
  let hardest: Fixture | null = null, hardestWrong = 0
  for (const f of scored) if (fxRight[f.id] > 0 && fxWrong[f.id] > hardestWrong) { hardestWrong = fxWrong[f.id]; hardest = f }
  if (hardest) {
    const h = hardest
    const hero = tippers.find(m => memberRightFx[m.user_id]?.has(h.id))
    const win = winnerOf(h)
    if (hero && win) {
      awards.push({ emoji: '🎲', title: 'The Maverick', winner: hero.name, detail: `Backed ${win} when ${hardestWrong} of the tribe didn't. Ice in the veins.` })
    }
  }

  // 💀 Collective Faceplant — the fixture the most members got wrong
  let flop: Fixture | null = null, flopWrong = 0
  for (const f of scored) if (fxWrong[f.id] > flopWrong) { flopWrong = fxWrong[f.id]; flop = f }
  if (flop && flopWrong > 0) {
    const win = winnerOf(flop)
    awards.push({
      emoji: '💀', title: 'Collective Faceplant', winner: null,
      detail: win
        ? `${flopWrong} member${flopWrong === 1 ? '' : 's'} didn't see ${win} coming in ${flop.home} v ${flop.away}.`
        : `${flopWrong} member${flopWrong === 1 ? '' : 's'} called ${flop.home} v ${flop.away} wrong — it was a draw.`,
    })
  }

  // 🥄 Wooden Spoon — fewest points among tippers (not the MVP)
  if (tippers.length > 1) {
    const worst = [...tippers].sort((a, b) => agg[a.user_id].pts - agg[b.user_id].pts || agg[a.user_id].correct - agg[b.user_id].correct)[0]
    if (worst && worst.user_id !== mvp?.user_id) {
      awards.push({ emoji: '🥄', title: 'Wooden Spoon', winner: worst.name, detail: `${agg[worst.user_id].pts} pts. A motivational poster has been dispatched.` })
    }
  }

  // 👻 The Ghost(s) — submitted no tips
  if (ghosts.length > 0) {
    awards.push({
      emoji: '👻', title: ghosts.length === 1 ? 'The Ghost' : 'The Ghosts', winner: null,
      detail: `${ghosts.slice(0, 4).map(g => g.name).join(', ')}${ghosts.length > 4 ? ` +${ghosts.length - 4} more` : ''} submitted zero tips. Allegedly "busy".`,
    })
  }

  const totalPts     = members.reduce((s, m) => s + agg[m.user_id].pts, 0)
  const totalCorrect = members.reduce((s, m) => s + agg[m.user_id].correct, 0)
  const totalTips    = members.reduce((s, m) => s + agg[m.user_id].tipped, 0)
  const acc = totalTips ? Math.round((totalCorrect / totalTips) * 100) : 0
  const verdict =
    !played   ? 'Awaiting results. The jury is still out.' :
    acc >= 70 ? "Frankly suspicious. Someone's been reading the team sheets early." :
    acc >= 50 ? 'Respectable. The bookmakers are mildly concerned.' :
    acc >= 30 ? 'Room for improvement. A dartboard has been requisitioned.' :
                "We're calling this one 'character building'."

  return {
    round_code: roundCode, round_name: roundName, tribe_name: tribeName,
    member_count: members.length, played, awards,
    stats: { tippers: tippers.length, total_members: members.length, total_points: totalPts, accuracy_pct: acc, verdict },
  }
}
