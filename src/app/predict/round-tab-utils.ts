// Round tab utilities — split out to avoid SWC TSX parsing issues
// with complex TypeScript signatures in .tsx files
import { getDefaultScoringConfig, type RoundId, type TournamentScoringConfig } from '@/types'

type RoundTab = string

export interface RoundTabConfig {
  tabs:        RoundTab[]
  tabLabel:    Record<RoundTab, string>
  tabToRounds: Record<RoundTab, RoundId[]>
}

export function buildRoundTabs(cfg: TournamentScoringConfig): RoundTabConfig {
  const tabLabel:    Record<RoundTab, string>     = {}
  const tabToRounds: Record<RoundTab, RoundId[]> = {}

  const ordered = Object.values(cfg.rounds)
    .sort((a, b) => (a.round_order ?? 0) - (b.round_order ?? 0))

  for (const rc of ordered) {
    const tab: RoundTab = rc.tab_group ?? rc.round_code
    if (!tabToRounds[tab]) {
      tabToRounds[tab] = []
      tabLabel[tab]    = rc.tab_label ?? `${rc.round_name}${rc.round_order}`
    }
    tabToRounds[tab].push(rc.round_code)
  }

  const tabs = Object.keys(tabToRounds) as RoundTab[]
  if (!tabs.length) {
    return { tabs: ['gs'], tabLabel: { gs: 'Group Stage' }, tabToRounds: { gs: ['gs'] } }
  }
  return { tabs, tabLabel, tabToRounds }
}

export function getScoringForTab(tab: RoundTab, cfg?: TournamentScoringConfig) {
  const c = cfg ?? getDefaultScoringConfig()
  const directRound = c.rounds[tab as RoundId]
  if (directRound) return directRound
  const inTab = Object.values(c.rounds).filter(r => (r.tab_group ?? r.round_code) === tab)
  return inTab.sort((a, b) => b.result_pts - a.result_pts)[0]
}
