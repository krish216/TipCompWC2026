// Bonus-team auto-allocation pool.
//
// Once the tournament is under way the bonus-team picker is locked, so players who
// join for the knockout run can't choose one. We auto-allocate them a team that's
// still alive — defined as the REAL teams drawn into the Round of 32 (the advancers).
// This is self-updating: as the R32 draw firms up, the pool grows toward 32. R32
// fixtures that still hold placeholder slots ("Group I 2nd Place", "Third Place …")
// are excluded automatically because those strings aren't in tournament_teams.

export async function getAliveTeamPool(admin: any, tournamentId: string): Promise<string[]> {
  const [{ data: r32 }, { data: roster }] = await Promise.all([
    admin.from('fixtures').select('home, away').eq('tournament_id', tournamentId).eq('round', 'r32'),
    admin.from('tournament_teams').select('name').eq('tournament_id', tournamentId),
  ])
  const real = new Set<string>((roster ?? []).map((t: any) => t.name))   // actual teams, not placeholders
  const pool = new Set<string>()
  for (const f of (r32 ?? []) as any[]) {
    if (real.has(f.home)) pool.add(f.home)
    if (real.has(f.away)) pool.add(f.away)
  }
  return [...pool]
}

// Pick one random alive team, or null when the R32 draw has no confirmed teams yet
// (e.g. before the knockouts) — caller should then assign nothing.
export async function pickAliveTeam(admin: any, tournamentId: string): Promise<string | null> {
  const pool = await getAliveTeamPool(admin, tournamentId)
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}
