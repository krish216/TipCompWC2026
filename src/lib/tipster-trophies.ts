// Tipster trophy-cabinet engine — the public /tipster/[id] page's stats board and trophy
// cabinet. Backward-looking and EARNED: what a tipster has WON, NAILED, SHOWED UP for, and
// their HERITAGE. Deliberately separate from the paid Pro "analyst's desk" (hit-rate trends,
// H2H, persona, tip review) in src/lib/tipster-stats.ts — this is the medals on the wall,
// that is the coaching video.
//
// The cabinet rewards two honest, un-gameable things: PARTICIPATION (you showed up — coverage,
// loyalty, being here from the start) and PERFORMANCE (you did well — finishes, ranks, exact
// scores). Analytical feats (hot streaks, giant-killer, form trends, persona) are deliberately
// NOT here — that pattern-reading is what the paid Pro "analyst's desk" sells.
//
// Phase 1 computes only the cheap trophies (leaderboard MV + a fixtures count + round
// breakdown — no full predictions scan). Comp-level podiums / champion / matchweek-winner are
// Phase 2 performance additions (they need per-comp rollups); absent for now, not shown locked.

import { feederTier } from '@/lib/dogs'

export type TrophyGroup = 'participation' | 'performance'

export interface TipsterTrophy {
  key: string; label: string; desc: string; icon: string; earned: boolean
  group: TrophyGroup
  progress?: { have: number; need: number }
}
export interface TipsterTitle { label: string; emoji: string }
export interface TipsterNugget { icon: string; label: string }
// Which story leads the cabinet. Not a label on the person — just which pillar we surface
// first, so the page validates a competitor's rank AND celebrates a regular's consistency.
export type TipsterLean = 'competitive' | 'community'
export interface TipsterBestRank { rank: number; totalPlayers: number; topPercent: number; tournament: string }
export interface TipsterTournamentLine {
  id: string; name: string; logo: string | null
  rank: number | null; totalPlayers: number; topPercent: number | null
  points: number; predictionsMade: number; fixturesDecided: number; coverage: number | null // 0..1
  inaugural: boolean
}
export interface TipsterStatsSummary {
  hasRecord:         boolean   // gate: appears in a leaderboard with predictions — a real record
  tournamentsPlayed: number
  roundsCompleted:   number    // distinct scored rounds across all tournaments
  challengesPlayed:  number    // distinct sponsor challenges entered (match + bracket)
  challengePodiums:  number    // top-3 challenge finishes (from stored final_rank, migration 168)
  challengeWins:     number    // challenges won (final_rank = 1)
  bonusPoints:       number    // total bonus points (fav-team 2× + pen-winner + exact from semis)
  totalPoints:       number
  coveragePct:       number | null   // career coverage 0..100 (predictions ÷ fixtures decided)
  coverageMade:      number
  coverageDecided:   number
  founding:          boolean
  lean:              TipsterLean  // competitive → performance leads; community → participation leads
  showRank:          boolean      // only surface the global rank pin in the headline when it flatters
  nuggets:           TipsterNugget[]  // positive performance highlights to pepper a community headline
  title:             TipsterTitle
  bestRank:          TipsterBestRank | null
  trophies:          TipsterTrophy[]
  tournaments:       TipsterTournamentLine[]
}

// A best-finish inside the top quarter reads as competitive validation; below that, a global
// rank deflates more than it flatters, so we lead with participation and pepper the positives.
const COMPETITIVE_MAX_PCT = 25

// Bonus points = fav-team 2× doubling + pen-winner + (from the semis) exact-score bonuses.
// NOT exact scores — those rounds haven't been played. Tiers calibrated to the live spread
// (max ~16 pre-semis), with headroom for the exact-score bonuses that land at the semis.
const BONUS_MILESTONES:    { n: number; key: string; label: string }[] = [
  { n: 5,  key: 'bh5',  label: 'Bonus Hunter' },
  { n: 10, key: 'bh10', label: 'Bonus Raider' },
  { n: 20, key: 'bh20', label: 'Bonus Baron' },
  { n: 40, key: 'bh40', label: 'Bonus Master' },
]
// Challenges are a handful per tournament (currently 1–9 entered per player); tiers leave
// headroom as more challenges — and EPL — land.
const CHALLENGE_MILESTONES: { n: number; key: string; label: string }[] = [
  { n: 1,  key: 'ch1',  label: 'Challenger' },
  { n: 3,  key: 'ch3',  label: 'Challenge Regular' },
  { n: 6,  key: 'ch6',  label: 'Challenge Devotee' },
  { n: 10, key: 'ch10', label: 'Challenge Diehard' },
]
const PODIUM_MILESTONES:   { n: number; key: string; label: string }[] = [
  { n: 1, key: 'pod1', label: 'Podium Finish' },
  { n: 3, key: 'pod3', label: 'Podium Regular' },
  { n: 5, key: 'pod5', label: 'Podium Machine' },
]
const COVERAGE_MILESTONES: { n: number; key: string; label: string }[] = [
  { n: 50,  key: 'cov50',  label: 'Regular' },
  { n: 75,  key: 'cov75',  label: 'Dedicated' },
  { n: 90,  key: 'cov90',  label: 'Ever-Ready' },
  { n: 100, key: 'cov100', label: 'Full Card' },
]
const TOPPCT_TIERS:        { n: number; key: string; label: string }[] = [
  { n: 10, key: 'top10', label: 'Top 10%' },
  { n: 5,  key: 'top5',  label: 'Top 5%' },
  { n: 1,  key: 'top1',  label: 'Top 1%' },
]

// A finish only counts as a podium/win if the challenge had a real field — winning a 1–4
// entrant challenge isn't an achievement.
const MIN_CHALLENGE_FIELD = 5

// Round a 0..1 coverage ratio to a whole percent, clamped (predictions_made can nudge past
// fixtures-decided at the margins of a scoring cycle).
const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n * 100)))

export async function getTipsterStats(admin: any, userId: string): Promise<TipsterStatsSummary> {
  // 1. Every tournament this tipster has a scored record in (one MV row per tournament).
  const { data: lbRows } = await (admin.from('leaderboard') as any)
    .select('tournament_id, total_points, total_bonus_points, bonus_count, correct_count, predictions_made')
    .eq('user_id', userId)
  const rows = ((lbRows ?? []) as any[]).filter(r => (r.predictions_made ?? 0) > 0)

  const empty: TipsterStatsSummary = {
    hasRecord: false, tournamentsPlayed: 0, roundsCompleted: 0, challengesPlayed: 0, challengePodiums: 0, challengeWins: 0, bonusPoints: 0, totalPoints: 0,
    coveragePct: null, coverageMade: 0, coverageDecided: 0, founding: false,
    lean: 'community', showRank: false, nuggets: [],
    title: { label: 'Tipster', emoji: '⚽' }, bestRank: null, trophies: [], tournaments: [],
  }
  if (rows.length === 0) return empty

  const tids = rows.map(r => r.tournament_id).filter(Boolean)

  // 2. Tournament metadata. select('*') so is_inaugural (migration 167) flows through without
  //    42703 on un-migrated DBs.
  const { data: tData } = await (admin.from('tournaments') as any).select('*').in('id', tids)
  const tById = new Map<string, any>()
  for (const t of ((tData ?? []) as any[])) tById.set(t.id, t)

  // 3. Rounds scored per tournament (distinct tab_group) — career "rounds completed", and the
  //    numerator for the Ever-Present check.
  const { data: brk } = await (admin.from('leaderboard_round_breakdown') as any)
    .select('tournament_id, tab_group, points').eq('user_id', userId)
  const roundsByTournament = new Map<string, Set<string>>()
  let bestRoundPoints = 0   // best single-round haul — a positive nugget that needs no high finish
  for (const b of ((brk ?? []) as any[])) {
    if (!roundsByTournament.has(b.tournament_id)) roundsByTournament.set(b.tournament_id, new Set())
    roundsByTournament.get(b.tournament_id)!.add(b.tab_group)
    if ((b.points ?? 0) > bestRoundPoints) bestRoundPoints = b.points
  }
  const roundsCompleted = [...roundsByTournament.values()].reduce((s, set) => s + set.size, 0)

  // 3c. Challenge participation + finishes — distinct sponsor challenges entered (match +
  //     bracket), plus stored finishing rank (migration 168, filled nightly by the cron).
  //     select('*') so final_rank/field_size flow through tolerantly pre-168. Every entrant is
  //     ranked, so both turning up AND top finishes are worth rewarding.
  let challengesPlayed = 0, challengePodiums = 0, challengeWins = 0
  let bestChallengeRank: number | null = null
  try {
    const [me, be] = await Promise.all([
      (admin.from('match_entries') as any).select('*').eq('user_id', userId),
      (admin.from('bracket_entries') as any).select('*').eq('user_id', userId),
    ])
    const ids = new Set<string>()
    for (const r of ([...(me.data ?? []), ...(be.data ?? [])] as any[])) {
      if (r.challenge_id) ids.add(r.challenge_id)
      const rank = r.final_rank
      if (rank != null && (r.field_size ?? 0) >= MIN_CHALLENGE_FIELD) {
        if (bestChallengeRank == null || rank < bestChallengeRank) bestChallengeRank = rank
        if (rank <= 3) challengePodiums++
        if (rank === 1) challengeWins++
      }
    }
    challengesPlayed = ids.size
  } catch { /* challenge tables absent → 0 */ }

  // 3d. Feeder status — cumulative donations ("Feed the doggies"). A generosity/support badge,
  //     never a performance one. Tolerant if the donations table isn't present.
  let fedCents = 0
  try {
    const { data: dons } = await (admin.from('donations') as any).select('amount_cents').eq('user_id', userId)
    for (const d of ((dons ?? []) as any[])) fedCents += d.amount_cents ?? 0
  } catch { /* donations table absent → 0 */ }

  // 3b. Total scoring rounds per tournament (Ever-Present denominator) — tolerant: if the
  //     tournament_rounds shape differs, Ever-Present just can't be earned this pass.
  const totalRoundsByTournament = new Map<string, number>()
  try {
    const { data: tr, error: trErr } = await (admin.from('tournament_rounds') as any)
      .select('tournament_id, tab_group, include_in_scoring').in('tournament_id', tids)
    if (!trErr && tr) {
      const seen = new Map<string, Set<string>>()
      for (const r of (tr as any[])) {
        if (r.include_in_scoring === false) continue
        const grp = r.tab_group ?? r.round_code
        if (!grp) continue
        if (!seen.has(r.tournament_id)) seen.set(r.tournament_id, new Set())
        seen.get(r.tournament_id)!.add(grp)
      }
      for (const [tid, set] of seen) totalRoundsByTournament.set(tid, set.size)
    }
  } catch { /* skip Ever-Present */ }

  // 4. Per-tournament rank, coverage and lines.
  const tournaments: TipsterTournamentLine[] = []
  let coverageMade = 0, coverageDecided = 0, everPresent = false, tournamentComplete = false
  let bestRank: TipsterBestRank | null = null

  for (const r of rows) {
    const tid = r.tournament_id as string
    const t = tById.get(tid)
    const myPoints = r.total_points ?? 0

    // Rank via two cheap count-only queries (mirrors tipster-stats.ts) — no full scan.
    const { count: totalPlayers } = await (admin.from('leaderboard') as any)
      .select('user_id', { count: 'exact', head: true }).eq('tournament_id', tid)
    const { count: ahead } = await (admin.from('leaderboard') as any)
      .select('user_id', { count: 'exact', head: true }).eq('tournament_id', tid).gt('total_points', myPoints)
    const players = totalPlayers ?? 0
    const rank = players ? (ahead ?? 0) + 1 : null
    const topPercent = rank && players ? Math.max(1, Math.round((rank / players) * 100)) : null

    // Coverage denominator = fixtures already decided (home_score set — no status column exists).
    const { count: decided } = await (admin.from('fixtures') as any)
      .select('id', { count: 'exact', head: true }).eq('tournament_id', tid).not('home_score', 'is', null)
    const fixturesDecided = decided ?? 0
    const made = r.predictions_made ?? 0
    const coverage = fixturesDecided > 0 ? Math.min(1, made / fixturesDecided) : null
    coverageMade += Math.min(made, fixturesDecided || made)
    coverageDecided += fixturesDecided

    const scoredRounds = roundsByTournament.get(tid)?.size ?? 0
    const totalRounds  = totalRoundsByTournament.get(tid) ?? 0
    if (totalRounds > 0 && scoredRounds >= totalRounds) everPresent = true
    if (t?.status === 'completed' && made > 0) tournamentComplete = true

    if (rank && topPercent != null && (!bestRank || topPercent < bestRank.topPercent)) {
      bestRank = { rank, totalPlayers: players, topPercent, tournament: t?.name ?? 'a tournament' }
    }

    tournaments.push({
      id: tid, name: t?.name ?? 'Tournament', logo: t?.logo_url ?? null,
      rank, totalPlayers: players, topPercent, points: myPoints,
      predictionsMade: made, fixturesDecided, coverage,
      inaugural: !!t?.is_inaugural,
    })
  }
  tournaments.sort((a, b) => b.points - a.points)

  const tournamentsPlayed = rows.length
  const bonusPoints = rows.reduce((s, r) => s + (r.total_bonus_points ?? 0), 0)
  const totalPoints  = rows.reduce((s, r) => s + (r.total_points ?? 0), 0)
  const coveragePct  = coverageDecided > 0 ? pct(coverageMade / coverageDecided) : null
  const bestCoveragePct = tournaments.reduce((m, t) => Math.max(m, t.coverage != null ? pct(t.coverage) : 0), 0)
  const founding = tournaments.some(t => t.inaugural)
  const bestTopPct = bestRank?.topPercent ?? null

  // ── Trophies ──────────────────────────────────────────────────────────────
  const trophies: TipsterTrophy[] = []

  // ── PARTICIPATION — you showed up (coverage, loyalty, being here from the start) ──
  // Coverage / Full Card (highest earned + next locked).
  pushMilestone(trophies, 'participation', '📋', bestCoveragePct, COVERAGE_MILESTONES, (m) => m.n === 100 ? 'Tipped every game in a tournament' : `Tipped ${m.n}%+ of a tournament`, (m) => m.n === 100 ? 'Tip a full card' : `Tip ${m.n}% of the card`, '%')
  if (everPresent)        trophies.push({ key: 'everpresent', label: 'Ever-Present', desc: 'Scored in every round of a tournament', icon: '🗓️', earned: true, group: 'participation' })
  if (tournamentComplete) trophies.push({ key: 'complete', label: 'Full Distance', desc: 'Played a tournament start to finish', icon: '🎓', earned: true, group: 'participation' })
  // Challenges entered — everyone who enters gets ranked, so showing up is the reward.
  pushMilestone(trophies, 'participation', '🥊', challengesPlayed, CHALLENGE_MILESTONES, (m) => `Entered ${m.n}+ challenge${m.n === 1 ? '' : 's'}`, (m) => m.n === 1 ? 'Enter a challenge' : `Enter ${m.n} challenges`)
  // Loyalty ladder — playing across tournaments.
  if (tournamentsPlayed >= 3)      trophies.push({ key: 'globe', label: 'Globetrotter', desc: 'Played 3+ tournaments', icon: '🌍', earned: true, group: 'participation' })
  else if (tournamentsPlayed >= 2) trophies.push({ key: 'multi', label: 'Multi-Tournament', desc: 'Played in 2+ tournaments', icon: '🌍', earned: true, group: 'participation' })
  else                             trophies.push({ key: 'next-globe', label: 'Multi-Tournament', desc: 'Play a 2nd tournament', icon: '🌍', earned: false, group: 'participation', progress: { have: tournamentsPlayed, need: 2 } })
  // Permanent heritage badge — being here for the very first tournament.
  if (founding) trophies.push({ key: 'founding', label: 'Founding Tipster', desc: "Tipped in TribePicks' first tournament", icon: '⭐', earned: true, group: 'participation' })
  // Supporter — fed the doggies (generosity, not skill; never a performance/scoring badge).
  const ft = feederTier(fedCents)
  if (ft) trophies.push({ key: 'feeder', label: ft.label, desc: 'Fed the TribePicks doggies 🐾', icon: ft.icon, earned: true, group: 'participation' })

  // ── PERFORMANCE — you did well (finishes, ranks, bonus points) ──
  // Best finish percentile (highest earned tier, else the next one to chase).
  {
    const earned = TOPPCT_TIERS.filter(t => bestTopPct != null && bestTopPct <= t.n)
    const top = earned[earned.length - 1]
    if (top) trophies.push({ key: top.key, label: top.label, desc: `Best finish in the top ${top.n}%`, icon: '🎖️', earned: true, group: 'performance' })
    else if (bestTopPct != null) trophies.push({ key: 'top10', label: 'Top 10%', desc: 'Finish in the top 10%', icon: '🎖️', earned: false, group: 'performance', progress: { have: Math.max(0, 100 - bestTopPct), need: 90 } })
  }
  // Bonus points — fav-team 2×, pen-winner, and exact-score bonuses (the last from the semis).
  pushMilestone(trophies, 'performance', '⚡', bonusPoints, BONUS_MILESTONES, (m) => `${m.n}+ bonus points earned`, (m) => `Earn ${m.n} bonus points`)
  // Challenge finishes — everyone who enters is ranked, so top-3s and wins are real results.
  pushMilestone(trophies, 'performance', '🥉', challengePodiums, PODIUM_MILESTONES, (m) => `${m.n}+ top-3 challenge finish${m.n === 1 ? '' : 'es'}`, (m) => m.n === 1 ? 'Finish top 3 in a challenge' : `Reach ${m.n} challenge podiums`)
  if (challengeWins > 0) trophies.push({ key: 'chwin', label: challengeWins >= 3 ? 'Challenge Champion' : 'Challenge Winner', desc: challengeWins === 1 ? 'Won a challenge outright' : `Won ${challengeWins} challenges`, icon: '🏆', earned: true, group: 'performance' })

  // ── Archetype lean — which story leads, and how the rank is handled ──
  const lean: TipsterLean = bestTopPct != null && bestTopPct <= COMPETITIVE_MAX_PCT ? 'competitive' : 'community'
  const showRank = lean === 'competitive'   // a flattering rank validates; a poor one deflates

  // Positive performance nuggets to pepper a community headline (no high finish required).
  const nuggets: TipsterNugget[] = []
  if (bestChallengeRank != null && bestChallengeRank <= 3) nuggets.push({ icon: bestChallengeRank === 1 ? '🏆' : '🥉', label: `Challenge #${bestChallengeRank}` })
  if (bonusPoints > 0)     nuggets.push({ icon: '⚡', label: `${bonusPoints} bonus pts` })
  if (bestRoundPoints > 0) nuggets.push({ icon: '🔥', label: `${bestRoundPoints} pts in a round` })
  if (nuggets.length === 0 && totalPoints > 0) nuggets.push({ icon: '📈', label: `${totalPoints} career pts` })

  return {
    hasRecord: true, tournamentsPlayed, roundsCompleted, challengesPlayed, challengePodiums, challengeWins, bonusPoints, totalPoints,
    coveragePct, coverageMade, coverageDecided, founding,
    lean, showRank, nuggets: nuggets.slice(0, 2),
    title: titleFor(lean, { bestTopPct, bonusPoints, bestCoveragePct, founding, tournamentsPlayed }),
    bestRank, trophies, tournaments,
  }
}

// Highest earned milestone (shown, not all) + the next one as a locked, in-progress trophy —
// so the cabinet always shows something achieved and something to chase.
function pushMilestone(
  out: TipsterTrophy[], group: TrophyGroup, icon: string, have: number,
  milestones: { n: number; key: string; label: string }[],
  earnedDesc: (m: { n: number }) => string, nextDesc: (m: { n: number }) => string, unit = '',
) {
  const earned = milestones.filter(m => have >= m.n)
  const top = earned[earned.length - 1]
  if (top) out.push({ key: top.key, label: top.label, desc: earnedDesc(top), icon, earned: true, group })
  const next = milestones.find(m => have < m.n)
  if (next) out.push({ key: `next-${next.key}`, label: next.label, desc: nextDesc(next) + (unit === '%' ? '' : ''), icon, earned: false, group, progress: { have, need: next.n } })
}

// Public headline title — achievement-derived (best finish / feat / heritage), deliberately
// NOT the playing-style persona, which stays a paid-Pro read. Lean-aware: a competitor's title
// leads on their finish; a community player's leads on consistency/heritage so a weak rank
// never becomes their headline.
function titleFor(lean: TipsterLean, x: { bestTopPct: number | null; bonusPoints: number; bestCoveragePct: number; founding: boolean; tournamentsPlayed: number }): TipsterTitle {
  if (lean === 'competitive') {
    if (x.bestTopPct != null && x.bestTopPct <= 1)  return { label: 'Top 1% Tipster',  emoji: '🏆' }
    if (x.bestTopPct != null && x.bestTopPct <= 5)  return { label: 'Top 5% Tipster',  emoji: '🥇' }
    if (x.bestTopPct != null && x.bestTopPct <= 10) return { label: 'Top 10% Tipster', emoji: '🎖️' }
    return { label: 'Top 25% Tipster', emoji: '🎖️' }
  }
  // community — celebrate showing up first, then heritage, then a positive feat.
  if (x.bestCoveragePct >= 100) return { label: 'Full-Card Tipster', emoji: '📋' }
  if (x.founding)               return { label: 'Founding Tipster',  emoji: '⭐' }
  if (x.tournamentsPlayed >= 3) return { label: 'Globetrotter',      emoji: '🌍' }
  if (x.bestCoveragePct >= 75)  return { label: 'Regular',           emoji: '📋' }
  if (x.bonusPoints >= 10)      return { label: 'Bonus Hunter',      emoji: '⚡' }
  return { label: 'Tipster', emoji: '⚽' }
}
