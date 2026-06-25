// Client-safe placeholder-team detection. Knockout fixtures carry placeholder
// "teams" (e.g. "TBD R32-1", "Winner Group A", "Runner-up B") until the bracket
// resolves — those fixtures must not be tippable. Kept in its own tiny module so
// both server routes and client components can import it without pulling in the
// heavier match-results helpers.

/** True when a fixture's team is still an unresolved placeholder (e.g. "TBD R16-1"). */
export function isPlaceholderTeam(name?: string | null): boolean {
  // Unresolved knockout slots: our seeds ("TBD R32-1") and ESPN descriptors
  // ("Group A 2nd Place", "Third Place Group A/B/C/D/F", "Round of 32 1 Winner").
  return !name || /tbd|winner|runner|loser|\bplace\b|\b3rd\b|\b[12][a-l]\b/i.test(name)
}

/** True when either side of a fixture is still a placeholder (so it can't be tipped). */
export function fixtureHasPlaceholder(f: { home?: string | null; away?: string | null }): boolean {
  return isPlaceholderTeam(f.home) || isPlaceholderTeam(f.away)
}
