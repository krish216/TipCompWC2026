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
type Pred    = { user_id: string; fixture_id: number; home: number; away: number; outcome?: string | null; points_earned: number | null }

const outcome = (h: number, a: number): 'H' | 'D' | 'A' => (h > a ? 'H' : a > h ? 'A' : 'D')
const winnerOf = (f: Fixture): string | null => {
  const h = f.home_score as number, a = f.away_score as number
  return h > a ? f.home : a > h ? f.away : (f.pen_winner ?? null)
}

// Punchlines rotate by round (seeded by the round code) so the debrief doesn't
// recycle the same gags week after week. Deterministic: a given round always reads
// the same, but consecutive rounds pick different lines.
const seedFrom = (s: string): number => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }

const MVP_LINES = [
  'the sharpest crystal ball in the tribe.',
  'nobody else came close.',
  'reading the matches like a cheat sheet.',
  'the tribe oracle this round.',
  'frankly, a little suspicious.',
  'please carry the rest of us.',
]
const MAVERICK_LINES = [
  'Ice in the veins.',
  'Contrarian and correct — the worst kind of right.',
  "Saw something the rest of us didn't.",
  "Genius or fluke; we'll allow it.",
  'Big-brain energy.',
]
const SPOON_LINES = [
  'A motivational poster has been dispatched.',
  'The team sheets are free to read, you know.',
  'Better luck next round. Statistically, anyway.',
  'A participation trophy is in the mail.',
  "We've alerted the next of kin.",
  'Tipping is hard. Evidently.',
]
const GHOST_LINES = [
  'submitted zero tips. Allegedly "busy".',
  'submitted zero tips. The dog ate them.',
  'submitted zero tips. Out of office, apparently.',
  'ghosted us entirely. Rude.',
  'submitted zero tips. We assume witness protection.',
]
const GLORY_SOLO = [
  'The whole tribe basks in the reflected glory.',
  "Carrying the tribe's honour on the world stage.",
  "We'll all pretend we helped.",
]
const GLORY_MANY = [
  'repping the tribe on the GLOBAL leaderboard. Reflected glory all round.',
  'flying the flag on the GLOBAL board. The rest of us claim partial credit.',
  "on the GLOBAL leaderboard — the tribe's honour, upheld.",
]
const SHARP_LINES = ['Deadeye.', 'Surgical.', 'The bookies flinched.', 'Show-off.', 'Calls them like a pundit.']
const FACEPLANT_LINES = ["Tough watch.", "We don't talk about that one.", 'Collective amnesia recommended.', "A moment's silence, please."]
const VERDICTS: Record<'high' | 'mid' | 'low' | 'grim', string[]> = {
  high: [
    "Frankly suspicious. Someone's been reading the team sheets early.",
    'Suspiciously sharp. The integrity unit is watching.',
    'Either brilliance or insider knowledge. We suspect the latter.',
  ],
  mid: [
    'Respectable. The bookmakers are mildly concerned.',
    "Solid work. Nobody's quitting their day job, though.",
    'Decent. The crystal balls are at least switched on.',
  ],
  low: [
    'Room for improvement. A dartboard has been requisitioned.',
    'Shaky. Have we tried just backing the favourites?',
    'The form guide is, apparently, optional reading.',
  ],
  grim: [
    "We're calling this one 'character building'.",
    "A rough round. The coin would've done better.",
    "Let's never speak of this round again.",
  ],
}

export function buildRoundDebrief(
  roundCode: string, roundName: string, tribeName: string,
  members: Member[], fixtures: Fixture[], preds: Pred[],
  // Optional: tribe members' rank on the GLOBAL leaderboard (user_id → 1-based rank),
  // present only for members who appear on it. Drives the 🌍 shout-out award.
  globalRanks?: Record<string, number>,
): RoundDebriefData {
  const scored = fixtures.filter(f => f.home_score != null && f.away_score != null)
  const played = scored.length > 0
  const actual: Record<number, 'H' | 'D' | 'A'> = {}
  scored.forEach(f => { actual[f.id] = outcome(f.home_score as number, f.away_score as number) })
  const scoredIds = new Set(scored.map(f => f.id))

  // Round-seeded punchline picker (salt per award so they don't all land on index 0).
  const seed = seedFrom(roundCode)
  const pick = (pool: string[], salt: number) => pool[(seed + salt) % pool.length]

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
    // Knockout picks are outcome-only (goal fields are 0-0), so trust the stored
    // `outcome` when present; fall back to deriving it from goals (group stage).
    const predOutcome = (p.outcome as 'H' | 'D' | 'A' | null) ?? outcome(p.home, p.away)
    if (predOutcome === actual[p.fixture_id]) {
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
    awards.push({ emoji: '🏆', title: 'Round MVP', winner: mvp.name, detail: `${agg[mvp.user_id].pts} pts — ${pick(MVP_LINES, 1)}` })
  }

  // 🌍 On the World Stage — tribe members who've made the GLOBAL leaderboard.
  if (globalRanks) {
    const onBoard = members
      .map(m => ({ name: m.name, rank: globalRanks[m.user_id] }))
      .filter((x): x is { name: string; rank: number } => typeof x.rank === 'number')
      .sort((a, b) => a.rank - b.rank)
    if (onBoard.length === 1) {
      awards.push({
        emoji: '🌍', title: 'On the World Stage', winner: onBoard[0].name,
        detail: `Sitting #${onBoard[0].rank} on the GLOBAL leaderboard. ${pick(GLORY_SOLO, 2)}`,
      })
    } else if (onBoard.length > 1) {
      const list = onBoard.slice(0, 5).map(x => `${x.name} (#${x.rank})`).join(', ')
      const more = onBoard.length > 5 ? ` +${onBoard.length - 5} more` : ''
      awards.push({
        emoji: '🌍', title: 'Flying the Flag', winner: null,
        detail: `${list}${more} — ${pick(GLORY_MANY, 3)}`,
      })
    }
  }

  // 🎯 Sharpshooter — most correct results (only if it's someone other than the MVP)
  const sharp = [...tippers].sort((a, b) => agg[b.user_id].correct - agg[a.user_id].correct)[0]
  if (sharp && agg[sharp.user_id].correct > 0 && sharp.user_id !== mvp?.user_id) {
    awards.push({ emoji: '🎯', title: 'Sharpshooter', winner: sharp.name, detail: `${agg[sharp.user_id].correct}/${scored.length} results called. ${pick(SHARP_LINES, 4)}` })
  }

  // 🎲 The Maverick — correctly called the fixture the tribe most got wrong
  let hardest: Fixture | null = null, hardestWrong = 0
  for (const f of scored) if (fxRight[f.id] > 0 && fxWrong[f.id] > hardestWrong) { hardestWrong = fxWrong[f.id]; hardest = f }
  if (hardest) {
    const h = hardest
    const hero = tippers.find(m => memberRightFx[m.user_id]?.has(h.id))
    const win = winnerOf(h)
    if (hero && win) {
      awards.push({ emoji: '🎲', title: 'The Maverick', winner: hero.name, detail: `Backed ${win} when ${hardestWrong} of the tribe didn't. ${pick(MAVERICK_LINES, 5)}` })
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
        ? `${flopWrong} member${flopWrong === 1 ? '' : 's'} didn't see ${win} coming in ${flop.home} v ${flop.away}. ${pick(FACEPLANT_LINES, 6)}`
        : `${flopWrong} member${flopWrong === 1 ? '' : 's'} called ${flop.home} v ${flop.away} wrong — it was a draw. ${pick(FACEPLANT_LINES, 6)}`,
    })
  }

  // 🥄 Wooden Spoon — fewest points among tippers (not the MVP)
  if (tippers.length > 1) {
    const worst = [...tippers].sort((a, b) => agg[a.user_id].pts - agg[b.user_id].pts || agg[a.user_id].correct - agg[b.user_id].correct)[0]
    if (worst && worst.user_id !== mvp?.user_id) {
      awards.push({ emoji: '🥄', title: 'Wooden Spoon', winner: worst.name, detail: `${agg[worst.user_id].pts} pts. ${pick(SPOON_LINES, 7)}` })
    }
  }

  // 👻 The Ghost(s) — submitted no tips
  if (ghosts.length > 0) {
    awards.push({
      emoji: '👻', title: ghosts.length === 1 ? 'The Ghost' : 'The Ghosts', winner: null,
      detail: `${ghosts.slice(0, 4).map(g => g.name).join(', ')}${ghosts.length > 4 ? ` +${ghosts.length - 4} more` : ''} ${pick(GHOST_LINES, 8)}`,
    })
  }

  const totalPts     = members.reduce((s, m) => s + agg[m.user_id].pts, 0)
  const totalCorrect = members.reduce((s, m) => s + agg[m.user_id].correct, 0)
  const totalTips    = members.reduce((s, m) => s + agg[m.user_id].tipped, 0)
  const acc = totalTips ? Math.round((totalCorrect / totalTips) * 100) : 0
  const band: 'high' | 'mid' | 'low' | 'grim' | null =
    !played ? null : acc >= 70 ? 'high' : acc >= 50 ? 'mid' : acc >= 30 ? 'low' : 'grim'
  const verdict = band ? pick(VERDICTS[band], 9) : 'Awaiting results. The jury is still out.'

  return {
    round_code: roundCode, round_name: roundName, tribe_name: tribeName,
    member_count: members.length, played, awards,
    stats: { tippers: tippers.length, total_members: members.length, total_points: totalPts, accuracy_pct: acc, verdict },
  }
}
