// Comp-Chief reputation engine (Phase 1a) — the stats bar, tier and honours cabinet on
// the public profile, computed on-read from comps + user_comps only (cheap; no per-view
// predictions scan). Retention and the RELATIVE cross-Chief rank come later in a nightly
// chief_scores view — those are the expensive, cohort-wide parts.

export interface ChiefTier { key: string; label: string; color: string }
export interface ChiefHonour {
  key: string; label: string; desc: string; icon: string; earned: boolean
  progress?: { have: number; need: number }
}
export interface ChiefStats {
  compsRun:       number   // every comp they run (public + private)
  tipstersLed:    number   // distinct members across all their comps — the "caps" count
  seasons:        number   // distinct tournaments they've fielded a comp in
  hiddenComps:    number   // comps NOT shown on the public profile (private / non-discoverable)
  hiddenPrivate:  number   // of those, how many are truly private (visibility='private')
  hiddenTipsters: number   // distinct members reachable ONLY via hidden comps (no double-count)
  tier:           ChiefTier
  honours:        ChiefHonour[]   // earned first, then the next locked milestone
}

// Absolute tiers (no cohort needed) — your own record earns the tier.
function tierFor(tipsters: number, seasons: number): ChiefTier {
  if (tipsters >= 500 && seasons >= 3) return { key: 'platinum', label: 'Platinum Chief', color: '#6E7B8B' }
  if (tipsters >= 150 && seasons >= 2) return { key: 'gold',     label: 'Gold Chief',     color: '#B4842A' }
  if (tipsters >= 50)                  return { key: 'silver',   label: 'Silver Chief',   color: '#8A8F98' }
  if (tipsters >= 15)                  return { key: 'bronze',   label: 'Bronze Chief',   color: '#A9713F' }
  return { key: 'rookie', label: 'Rookie Chief', color: '#5C6B62' }
}

const TIPSTER_MILESTONES: { n: number; key: string; label: string }[] = [
  { n: 50,  key: 'half',   label: 'Half-Century' },
  { n: 100, key: 'cent',   label: 'Century Club' },
  { n: 200, key: 'double', label: 'Double Century' },
  { n: 500, key: 'five',   label: 'Five Hundred' },
]

export async function getChiefStats(admin: any, userId: string): Promise<ChiefStats> {
  // All comps this person runs (aggregate stats span private comps too; the profile lists
  // only open ones separately).
  // select('*') so `featured` (migration 164) flows through without erroring pre-apply.
  const { data: comps } = await (admin.from('comps') as any)
    .select('*').eq('created_by', userId)
  const compRows = (comps ?? []) as any[]
  const compIds  = compRows.map(c => c.id)
  // "Shown" comps are exactly the ones the public profile lists: open+discoverable, plus
  // any the Chief explicitly featured.
  const shownIds = new Set(compRows.filter(c => (c.visibility === 'open' && c.is_discoverable) || c.featured).map(c => c.id))

  // Members across those comps → distinct = tipsters led; per-comp counts → Full House.
  const memberByComp = new Map<string, Set<string>>()
  const distinctMembers = new Set<string>()
  if (compIds.length) {
    const { data: ucs } = await (admin.from('user_comps') as any)
      .select('user_id, comp_id').in('comp_id', compIds)
    for (const r of (ucs ?? []) as any[]) {
      distinctMembers.add(r.user_id)
      if (!memberByComp.has(r.comp_id)) memberByComp.set(r.comp_id, new Set())
      memberByComp.get(r.comp_id)!.add(r.user_id)
    }
  }

  const tipstersLed = distinctMembers.size
  const seasons     = new Set(compRows.map(c => c.tournament_id).filter(Boolean)).size

  // Distinct members already represented by the SHOWN (open) comps — so "more tipsters"
  // below counts only people reachable exclusively through hidden comps.
  const shownMembers = new Set<string>()
  for (const [cid, set] of memberByComp) if (shownIds.has(cid)) for (const uid of set) shownMembers.add(uid)
  const hiddenComps    = compRows.length - shownIds.size
  const hiddenPrivate  = compRows.filter(c => !shownIds.has(c.id) && c.visibility === 'private').length
  const hiddenTipsters = Math.max(0, tipstersLed - shownMembers.size)
  const hitCap      = compRows.some(c => c.member_cap != null && (memberByComp.get(c.id)?.size ?? 0) >= c.member_cap)
  const ranDerby    = compRows.some(c => c.comp_category === 'team_fans')
  // Founding Chief — ran a comp in TribePicks' first tournament (the inaugural one, WC2026).
  // Mirrors the Founding Tipster badge. Tolerant: no founding if is_inaugural isn't applied.
  let inauguralIds = new Set<string>()
  try {
    const { data: inaug } = await (admin.from('tournaments') as any).select('id').eq('is_inaugural', true)
    inauguralIds = new Set(((inaug ?? []) as any[]).map(t => t.id))
  } catch { /* is_inaugural (migration 167) not applied → no founding */ }
  const founding    = compRows.some(c => c.tournament_id && inauguralIds.has(c.tournament_id))

  // ── Honours ─────────────────────────────────────────────────────────────
  const honours: ChiefHonour[] = []
  // Highest earned tipster milestone (show one, not all four).
  const earnedMilestones = TIPSTER_MILESTONES.filter(m => tipstersLed >= m.n)
  const top = earnedMilestones[earnedMilestones.length - 1]
  if (top) honours.push({ key: top.key, label: top.label, desc: `Led ${top.n}+ tipsters`, icon: '🏅', earned: true })

  if (seasons >= 3) honours.push({ key: 'veteran',  label: 'Seasoned Chief', desc: `Active across ${seasons} tournaments`, icon: '🗓️', earned: true })
  else if (seasons >= 2) honours.push({ key: 'multi', label: 'Multi-Season', desc: 'Ran comps in 2+ tournaments', icon: '🗓️', earned: true })

  if (founding) honours.push({ key: 'founding', label: 'Founding Chief', desc: "Ran a comp in TribePicks' first tournament", icon: '⚓', earned: true })
  if (hitCap)   honours.push({ key: 'fullhouse', label: 'Full House',     desc: 'A comp hit its cap',        icon: '🏟️', earned: true })
  if (ranDerby) honours.push({ key: 'derby',     label: 'Derby Maker',    desc: 'Ran a team-fans comp',      icon: '🔥', earned: true })

  // Next tipster milestone as a locked, in-progress honour (always something to chase).
  const next = TIPSTER_MILESTONES.find(m => tipstersLed < m.n)
  if (next) honours.push({
    key: `next-${next.key}`, label: next.label, desc: `Lead ${next.n} tipsters`, icon: '🎖️',
    earned: false, progress: { have: tipstersLed, need: next.n },
  })

  return {
    compsRun: compRows.length, tipstersLed, seasons, hiddenComps, hiddenPrivate, hiddenTipsters,
    tier: tierFor(tipstersLed, seasons), honours,
  }
}
