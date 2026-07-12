// Round tab utilities — split out to avoid SWC TSX parsing issues
// with complex TypeScript signatures in .tsx files
import { getDefaultScoringConfig, type RoundId, type TournamentScoringConfig } from '@/types'

type RoundTab = string

export interface RoundTabConfig {
  tabs:        RoundTab[]
  tabLabel:    Record<RoundTab, string>
  tabToRounds: Record<RoundTab, RoundId[]>
}

/**
 * Build tab config from scoringConfig (loaded from tournament_rounds table).
 *
 * Tab grouping:  rounds share a tab when they have the same tab_group value.
 * Tab ordering:  tabs sorted by MAX(round_order) within each tab_group — so the
 *                Finals tab (tp=6, f=7) gets order 7, correctly placed last.
 * Tab label:     taken from tab_label field (explicit DB column, avoids round_name ambiguity).
 *                Falls back to round_name then round_code if tab_label not yet populated.
 *
 * No round codes are hardcoded — everything is derived from the DB rows.
 */
export function buildRoundTabs(cfg: TournamentScoringConfig): RoundTabConfig {
  const tabLabel:    Record<RoundTab, string>     = {}
  const tabToRounds: Record<RoundTab, RoundId[]> = {}
  const tabMaxOrder: Record<RoundTab, number>    = {}  // MAX(round_order) per tab_group

  const allRounds = Object.values(cfg.rounds)
    .sort((a, b) => (a.round_order ?? 0) - (b.round_order ?? 0))

  for (const rc of allRounds) {
    const tab: RoundTab = rc.tab_group ?? rc.round_code

    if (!tabToRounds[tab]) {
      tabToRounds[tab] = []
      // Label: use explicit tab_label > round_name > round_code
      tabLabel[tab]    = (rc as any).tab_label ?? rc.round_name ?? rc.round_code
      tabMaxOrder[tab] = rc.round_order ?? 0
    } else {
      // Update MAX(round_order) for this group
      tabMaxOrder[tab] = Math.max(tabMaxOrder[tab], rc.round_order ?? 0)
      // Re-apply label from the highest-order round in the group
      // (ensures "Finals" comes from f row if tab_label differs between tp and f)
      if ((rc.round_order ?? 0) >= tabMaxOrder[tab]) {
        tabLabel[tab] = (rc as any).tab_label ?? rc.round_name ?? rc.round_code
      }
    }
    tabToRounds[tab].push(rc.round_code)
  }

  // Sort tabs by MAX(round_order) — fully DB-driven, no hardcoding
  const tabs = Object.keys(tabToRounds).sort(
    (a, b) => (tabMaxOrder[a] ?? 0) - (tabMaxOrder[b] ?? 0)
  ) as RoundTab[]

  if (!tabs.length) {
    return { tabs: ['gs'], tabLabel: { gs: 'Group Stage' }, tabToRounds: { gs: ['gs'] } }
  }

  return { tabs, tabLabel, tabToRounds }
}

export interface MonthRailEntry {
  key:      string        // month_key (e.g. 'aug')
  label:    string        // month_label (e.g. 'Aug')
  tabs:     RoundTab[]     // matchweek tabs that fall in this month, in order
  firstTab: RoundTab       // first matchweek of the month — the jump target
}

/**
 * Build the month "overlay" rail for week-structured tournaments (e.g. EPL).
 *
 * Given the ordered tab list, groups tabs by the month_key of their round and
 * returns one entry per month (in first-appearance order). Returns [] when no
 * round carries a month_key (e.g. WC) — callers use that to hide the rail.
 */
export function buildMonthRail(tabs: RoundTab[], cfg: TournamentScoringConfig): MonthRailEntry[] {
  const out: MonthRailEntry[] = []
  const idx: Record<string, number> = {}
  for (const tab of tabs) {
    // tab === round_code for week tournaments; fall back to any round in the tab group.
    const r = cfg.rounds[tab as RoundId]
      ?? Object.values(cfg.rounds).find(x => (x.tab_group ?? x.round_code) === tab)
    const mk = (r as any)?.month_key as string | undefined
    if (!mk) continue
    if (idx[mk] == null) {
      idx[mk] = out.length
      out.push({ key: mk, label: (r as any)?.month_label ?? mk, tabs: [tab], firstTab: tab })
    } else {
      out[idx[mk]].tabs.push(tab)
    }
  }
  return out
}

/** The month_key of a given tab, or null when the tab has no month overlay. */
export function monthKeyForTab(tab: RoundTab, cfg: TournamentScoringConfig): string | null {
  const r = cfg.rounds[tab as RoundId]
    ?? Object.values(cfg.rounds).find(x => (x.tab_group ?? x.round_code) === tab)
  return ((r as any)?.month_key as string | undefined) ?? null
}

export function getScoringForTab(tab: RoundTab, cfg?: TournamentScoringConfig) {
  const c = cfg ?? getDefaultScoringConfig()
  const directRound = c.rounds[tab as RoundId]
  if (directRound) return directRound
  const inTab = Object.values(c.rounds).filter(r => (r.tab_group ?? r.round_code) === tab)
  return inTab.sort((a, b) => b.result_pts - a.result_pts)[0]
}
