import { createAdminClient } from '@/lib/supabase'
import { flagFor } from '@/lib/team-flags'

// Server-only data layer for the PUBLIC World Cup 2026 content pages (team profiles,
// group pages, sitemap). These pages are statically rendered + revalidated so the
// crawler always sees substantial, current HTML. Read-only; safe to use the admin
// client server-side (only the selected public columns are ever returned).

export type Team = { name: string; code: string; flag: string; rank: number | null; group: string | null }
export type Fixture = {
  id: number; round: string; grp: string | null; home: string; away: string
  kickoff_utc: string | null; venue: string | null
  home_score: number | null; away_score: number | null; pen_winner: string | null
  bracket_slot: string | null
}
export type Standing = {
  team: string; flag: string; played: number; won: number; drawn: number; lost: number
  gf: number; ga: number; gd: number; points: number
}

const GROUP_ROUND = (r: string) => r.startsWith('gs')
const KO_ORDER: Record<string, number> = { r32: 1, r16: 2, qf: 3, sf: 4, tp: 5, final: 6 }
export const ROUND_LABEL: Record<string, string> = {
  gs1: 'Matchday 1', gs2: 'Matchday 2', gs3: 'Matchday 3',
  r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-final', sf: 'Semi-final',
  tp: 'Third-place play-off', final: 'Final',
}

export async function getActiveTournament() {
  const admin = createAdminClient()
  const { data } = await admin.from('tournaments').select('id, name, slug').eq('is_active', true).maybeSingle()
  return (data as any) ?? null
}

export async function getTeamsAndFixtures(tournamentId: string): Promise<{ teams: Team[]; fixtures: Fixture[] }> {
  const admin = createAdminClient()
  const [{ data: rawTeams }, { data: rawFx }] = await Promise.all([
    admin.from('tournament_teams').select('name, fifa_code, flag_emoji, fifa_rank').eq('tournament_id', tournamentId),
    admin.from('fixtures').select('id, round, grp, home, away, kickoff_utc, venue, home_score, away_score, pen_winner, bracket_slot').eq('tournament_id', tournamentId),
  ])
  const fixtures = ((rawFx ?? []) as any[]).map(f => ({ ...f })) as Fixture[]

  // Each team's group is the grp of its group-stage fixtures.
  const groupOf = new Map<string, string>()
  for (const f of fixtures) {
    if (GROUP_ROUND(f.round) && f.grp) {
      if (f.home) groupOf.set(f.home, f.grp)
      if (f.away) groupOf.set(f.away, f.grp)
    }
  }

  const teams: Team[] = ((rawTeams ?? []) as any[]).map(t => ({
    name: t.name,
    code: (t.fifa_code || t.name.slice(0, 3)).toLowerCase(),
    flag: t.flag_emoji || flagFor(t.name),
    rank: t.fifa_rank ?? null,
    group: groupOf.get(t.name) ?? null,
  })).sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))

  return { teams, fixtures }
}

// Group-stage table for one group, computed from played fixtures.
export function standingsFor(group: string, teams: Team[], fixtures: Fixture[]): Standing[] {
  const inGroup = teams.filter(t => t.group === group)
  const rows = new Map<string, Standing>()
  for (const t of inGroup) rows.set(t.name, { team: t.name, flag: t.flag, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 })

  for (const f of fixtures) {
    if (!GROUP_ROUND(f.round) || f.grp !== group) continue
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
  return [...rows.values()].sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team))
}

export const groupLetters = (teams: Team[]): string[] =>
  [...new Set(teams.map(t => t.group).filter(Boolean) as string[])].sort()

// Fixtures involving a team, sorted chronologically.
export function teamFixtures(team: string, fixtures: Fixture[]): Fixture[] {
  return fixtures
    .filter(f => f.home === team || f.away === team)
    .sort((a, b) => (a.kickoff_utc ?? '').localeCompare(b.kickoff_utc ?? '') || (KO_ORDER[a.round] ?? 0) - (KO_ORDER[b.round] ?? 0))
}

// Did this team reach the Round of 32 (appears in an r32 fixture)?
export function reachedKnockouts(team: string, fixtures: Fixture[]): boolean {
  return fixtures.some(f => f.round === 'r32' && (f.home === team || f.away === team))
}

// Compact W/D/L form string from a team's played matches (most recent last).
export function teamForm(team: string, fixtures: Fixture[]): ('W' | 'D' | 'L')[] {
  return teamFixtures(team, fixtures)
    .filter(f => f.home_score != null && f.away_score != null)
    .map(f => {
      const us = f.home === team ? f.home_score! : f.away_score!
      const them = f.home === team ? f.away_score! : f.home_score!
      return us > them ? 'W' : us < them ? 'L' : 'D'
    })
}

export const fmtDate = (iso: string | null): string => {
  if (!iso) return 'TBC'
  try {
    return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return 'TBC' }
}
export const fmtKick = (iso: string | null): string => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
  } catch { return '' }
}

// Human ordinal for a FIFA rank, e.g. 1 → "1st".
export const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
