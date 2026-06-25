// Client-safe placeholder-team detection. Knockout fixtures carry placeholder
// "teams" (e.g. "TBD R32-1", "Winner Group A", "Runner-up B") until the bracket
// resolves — those fixtures must not be tippable. Kept in its own tiny module so
// both server routes and client components can import it without pulling in the
// heavier match-results helpers.

import { canonTeam } from './team-canon'

/**
 * Name-pattern heuristic for an unresolved knockout slot. Used as a fallback when
 * the real-team list isn't available — the authoritative check is membership in
 * tournament_teams (see isUnknownTeam / knownTeamSet).
 */
export function isPlaceholderTeam(name?: string | null): boolean {
  // Unresolved knockout slots: our seeds ("TBD R32-1") and ESPN descriptors
  // ("Group A 2nd Place", "Third Place Group A/B/C/D/F", "Round of 32 1 Winner").
  return !name || /tbd|winner|runner|loser|\bplace\b|\b3rd\b|\b[12][a-l]\b/i.test(name)
}

/** Canonical token set of the tournament's real teams, for membership checks. */
export function knownTeamSet(teamNames: Array<string | null | undefined>): Set<string> {
  return new Set(teamNames.map(n => canonTeam(n)).filter(Boolean))
}

/**
 * Authoritative placeholder check: a fixture side is a placeholder unless it is one
 * of the tournament's real teams (matched via canonTeam, so "United States" == "USA").
 * Falls back to the name heuristic when no team set is supplied.
 */
export function isUnknownTeam(name: string | null | undefined, known?: Set<string> | null): boolean {
  if (known && known.size) return !known.has(canonTeam(name))
  return isPlaceholderTeam(name)
}

/** True when either side of a fixture isn't a confirmed real team (so it can't be tipped). */
export function fixtureHasPlaceholder(
  f: { home?: string | null; away?: string | null },
  known?: Set<string> | null,
): boolean {
  return isUnknownTeam(f.home, known) || isUnknownTeam(f.away, known)
}
