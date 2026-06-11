/**
 * Bonus/favourite-team lock.
 *
 * The favourite team grants 2× points, so it must be frozen once play begins.
 * The UI disables the picker at the first kickoff, but that's cosmetic — the
 * server uses this to actually refuse late changes. Lock point = the earliest
 * REAL (non-warm-up) fixture kickoff for the tournament, read from the DB so it's
 * authoritative and tournament-specific (not a hardcoded constant).
 */
export async function isBonusTeamLocked(client: any, tournamentId: string): Promise<boolean> {
  const { data } = await client
    .from('fixtures')
    .select('kickoff_utc')
    .eq('tournament_id', tournamentId)
    .neq('round', 'wup')                       // ignore warm-up/practice fixtures
    .order('kickoff_utc', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!data?.kickoff_utc) return false          // no real fixtures yet → not locked
  return Date.now() >= new Date(data.kickoff_utc).getTime()
}
