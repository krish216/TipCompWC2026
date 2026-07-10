import { createAdminClient } from '@/lib/supabase'
import { flagFor } from '@/lib/team-flags'

// Server-only data layer for the PUBLIC World Cup 2026 content pages (team profiles,
// group pages, sitemap). These pages are statically rendered + revalidated so the
// crawler always sees substantial, current HTML. Read-only; safe to use the admin
// client server-side (only the selected public columns are ever returned).

export type Team = { name: string; code: string; flag: string; logo: string | null; rank: number | null; group: string | null }
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

export type TournamentRef = { id: string; name: string; slug: string }

// The deterministic "current" tournament — safe when SEVERAL tournaments are active at
// once (WC→EPL handover, multi-tournament switcher). Prefers the flagged is_primary,
// then the most-recently-started. `.limit(1).maybeSingle()` never errors on multiple
// rows, unlike the bare `.eq('is_active',true).maybeSingle()` this replaces everywhere.
export async function getPrimaryTournament(admin: any): Promise<TournamentRef | null> {
  const { data } = await admin.from('tournaments')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as any) ?? null
}

export async function getActiveTournament(): Promise<TournamentRef | null> {
  return getPrimaryTournament(createAdminClient())
}

// Whether a tournament has real match data yet (≥1 fixture with a result). Used to
// gate search indexing: a pre-season tournament is all templated shells (no results,
// no recaps) and reads as thin / low-value content, so we noindex it until it has
// played matches, and keep it out of the sitemap.
export async function tournamentHasResults(tournamentId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { count } = await admin.from('fixtures')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .not('home_score', 'is', null)
  return (count ?? 0) > 0
}

// Resolve a tournament by its public slug (the URL segment). Content pages are
// tournament-scoped (/[slug]/teams, /[slug]/groups) so each tournament has its own
// stable URLs — the content at /wc2026/teams/arg never changes when the active
// tournament changes.
export async function getTournamentBySlug(slug: string): Promise<TournamentRef | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('tournaments').select('id, name, slug').eq('slug', slug).maybeSingle()
  return (data as any) ?? null
}

// Every tournament that has public content (≥1 team) — drives the sitemap and static
// params so past tournaments stay live as evergreen content.
export async function getPublicTournaments(): Promise<TournamentRef[]> {
  const admin = createAdminClient()
  const { data: ts } = await admin.from('tournaments').select('id, name, slug').order('start_date', { ascending: false })
  const out: TournamentRef[] = []
  for (const t of ((ts ?? []) as any[])) {
    const { count } = await admin.from('tournament_teams').select('id', { count: 'exact', head: true }).eq('tournament_id', t.id)
    if ((count ?? 0) > 0) out.push({ id: t.id, name: t.name, slug: t.slug })
  }
  return out
}

export async function getTeamsAndFixtures(tournamentId: string): Promise<{ teams: Team[]; fixtures: Fixture[] }> {
  const admin = createAdminClient()
  const [{ data: rawTeams }, { data: rawFx }] = await Promise.all([
    admin.from('tournament_teams').select('name, fifa_code, flag_emoji, fifa_rank, logo_url').eq('tournament_id', tournamentId),
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
    logo: t.logo_url ?? null,   // club crest (clubs) — takes precedence over the flag emoji in the UI
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

// ── Round recaps (public, no PII) ───────────────────────────────────────────────
// SEO-friendly round-code ↔ URL-slug (e.g. r16 ↔ round-of-16). Unknown codes fall
// back to the raw code so non-WC tournaments still work.
export const ROUND_SLUG: Record<string, string> = {
  gs1: 'matchday-1', gs2: 'matchday-2', gs3: 'matchday-3',
  r32: 'round-of-32', r16: 'round-of-16', qf: 'quarter-finals', sf: 'semi-finals', tp: 'third-place', final: 'final',
}
const SLUG_TO_ROUND: Record<string, string> = Object.fromEntries(Object.entries(ROUND_SLUG).map(([c, s]) => [s, c]))
export const roundSlug = (code: string): string => ROUND_SLUG[code] ?? code
export const roundFromSlug = (slug: string): string => SLUG_TO_ROUND[slug] ?? slug

// Rounds that have at least one finished fixture, in play order — drives the recap
// index and static params. Excludes the warm-up round ('wup'): it's not a real
// competition round and doesn't make article-worthy recap content.
export function playedRounds(fixtures: Fixture[]): string[] {
  const codes = new Set<string>()
  for (const f of fixtures) if (f.round !== 'wup' && f.home_score != null && f.away_score != null) codes.add(f.round)
  const order = (r: string) => (r.startsWith('gs') ? Number(r.slice(2)) : 10 + (KO_ORDER[r] ?? 99))
  return [...codes].sort((a, b) => order(a) - order(b))
}

export type PickStat = { h: number; d: number; a: number; total: number }
export async function getPickStats(fixtureIds: number[]): Promise<Map<number, PickStat>> {
  const map = new Map<number, PickStat>()
  if (!fixtureIds.length) return map
  const admin = createAdminClient()
  const { data } = await admin.from('fixture_pick_stats').select('fixture_id, h, d, a, total').in('fixture_id', fixtureIds)
  for (const r of ((data ?? []) as any[])) map.set(r.fixture_id, { h: r.h, d: r.d, a: r.a, total: r.total })
  return map
}

export interface RecapFixture {
  id: number; home: string; away: string; homeFlag: string; awayFlag: string
  home_score: number; away_score: number; pen_winner: string | null
  crowd: PickStat | null
}
export interface RoundRecap {
  round_code: string; round_name: string
  played: number; totalGoals: number
  results: RecapFixture[]
  upsets: { fx: RecapFixture; note: string }[]
  topMatch: RecapFixture | null
}

const outcomeOf = (h: number, a: number): 'H' | 'D' | 'A' => (h > a ? 'H' : a > h ? 'A' : 'D')

// Build a public recap for one round from results + crowd pick distribution. No member
// data — only aggregate crowd percentages and scorelines.
export function buildRoundRecap(round: string, teams: Team[], fixtures: Fixture[], picks: Map<number, PickStat>): RoundRecap {
  const flagOf = (name: string) => teams.find(t => t.name === name)?.flag ?? flagFor(name)
  const played = fixtures
    .filter(f => f.round === round && f.home_score != null && f.away_score != null)
    .sort((a, b) => (a.kickoff_utc ?? '').localeCompare(b.kickoff_utc ?? ''))

  const results: RecapFixture[] = played.map(f => ({
    id: f.id, home: f.home, away: f.away, homeFlag: flagOf(f.home), awayFlag: flagOf(f.away),
    home_score: f.home_score as number, away_score: f.away_score as number, pen_winner: f.pen_winner ?? null,
    crowd: picks.get(f.id) ?? null,
  }))

  const totalGoals = results.reduce((s, f) => s + f.home_score + f.away_score, 0)

  // "Against the crowd": the majority H/D/A pick didn't come in, and the crowd was
  // reasonably confident (≥50% share, ≥20 tippers). Ranked by how lopsided they were.
  const upsets: { fx: RecapFixture; note: string; share: number }[] = []
  for (const f of results) {
    if (!f.crowd || f.crowd.total < 20) continue
    const { h, d, a, total } = f.crowd
    const top = Math.max(h, d, a)
    const share = top / total
    const crowdPick: 'H' | 'D' | 'A' = h === top ? 'H' : d === top ? 'D' : 'A'
    const actual = outcomeOf(f.home_score, f.away_score)
    if (crowdPick !== actual && share >= 0.5) {
      const backed = crowdPick === 'H' ? f.home : crowdPick === 'A' ? f.away : 'a draw'
      const happened = actual === 'H' ? `${f.home} won` : actual === 'A' ? `${f.away} won` : 'it finished level'
      upsets.push({ fx: f, share, note: `${Math.round(share * 100)}% of tippers backed ${backed}, but ${happened} ${f.home_score}–${f.away_score}.` })
    }
  }
  upsets.sort((x, y) => y.share - x.share)

  const topMatch = results.length
    ? results.reduce((best, f) => (f.home_score + f.away_score) > (best.home_score + best.away_score) ? f : best)
    : null

  return {
    round_code: round,
    round_name: ROUND_LABEL[round] ?? round,
    played: results.length,
    totalGoals,
    results,
    upsets: upsets.map(({ fx, note }) => ({ fx, note })),
    topMatch,
  }
}
