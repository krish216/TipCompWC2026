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
  // Admin override (app_settings.bonus_lock_at = ISO timestamp). Lets us re-open the
  // bonus-team picker — e.g. extend the bonus to the Round of 32 and give everyone a
  // fresh pick beforehand. When set it fully replaces the default; clear it to
  // restore the default earliest-kickoff behaviour.
  try {
    const { data: ov } = await client
      .from('app_settings').select('value').eq('key', 'bonus_lock_at').maybeSingle()
    const override = (ov as any)?.value
    if (override) return Date.now() >= new Date(override).getTime()
  } catch { /* fall through to the default */ }

  // Default: lock at the earliest real (non-warm-up) fixture kickoff.
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
