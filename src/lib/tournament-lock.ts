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
  // The lock only guards the fav_team_2x advantage (WC): without it, a late change could
  // point a 2× multiplier at already-known results. Tournaments with no fav_team_2x round
  // don't need it and stay unlocked, so anyone joining mid-season can still pick.
  // EPL's favourite team instead drives an EXACT-focus bonus (fav_exact_bonus): it only
  // pays when you entered the exact score for that team's match, and exact picks lock at
  // kickoff — so a late or changed favourite can't manufacture a bonus (an H/D/A tap won't
  // match an exact score). That mechanic is self-gating, hence needs no lock.
  const { data: bonusRound } = await client
    .from('tournament_rounds')
    .select('round_code')
    .eq('tournament_id', tournamentId)
    .eq('fav_team_2x', true)
    .limit(1)
    .maybeSingle()
  if (!bonusRound) return false

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

/**
 * EPL exact-focus club lock.
 *
 * The favourite drives a per-round EXACT-score bonus, and the scoring trigger reads the
 * favourite LIVE for each fixture as its result lands (migration 152). Because the
 * favourite is a single mutable field, a tipster could otherwise hop it onto every match
 * they nailed and harvest the bonus across a whole matchweek. So once the club is committed
 * for the current round — i.e. the tipster has entered a scoreline (a focus pick, stored
 * with outcome IS NULL) for that club's match in an OPEN round — the club is frozen until
 * the next round opens. The lock is overridden by PRACTICE mode (the tournament's
 * allow_retroactive_predictions flag), checked by the caller — so warm-up/testing picks
 * stay freely changeable while practice mode is on, and freeze once it's off.
 *
 * Returns true when `favTeam` is committed this round, so a change away from it must be
 * refused. The lock releases automatically next round (round_locks moves on).
 */
export async function isExactFocusClubCommitted(
  client: any,
  tournamentId: string,
  userId: string,
  favTeam: string | null,
): Promise<boolean> {
  if (!favTeam) return false

  // Open rounds for this tournament (includes the warm-up round — practice mode is the
  // override, handled by the caller, not a per-round exclusion).
  const { data: locks } = await client
    .from('round_locks')
    .select('round_code')
    .eq('tournament_id', tournamentId)
    .eq('is_open', true)
  const openRounds = (locks ?? []).map((r: any) => r.round_code as string)
  if (openRounds.length === 0) return false

  // The favourite's fixtures within those open rounds. Filtered in JS rather than via a
  // PostgREST .or() on team names, which is fragile when names contain spaces/&/parentheses.
  const { data: fixtures } = await client
    .from('fixtures')
    .select('id, home, away')
    .eq('tournament_id', tournamentId)
    .in('round', openRounds)
  const favFixtureIds = (fixtures ?? [])
    .filter((f: any) => f.home === favTeam || f.away === favTeam)
    .map((f: any) => f.id)
  if (favFixtureIds.length === 0) return false

  // A committed focus pick = a prediction with a scoreline (outcome IS NULL) on one of
  // those fixtures. An ordinary H/D/A tap stores outcome='H'|'D'|'A' (home/away = 0), so
  // it is correctly ignored.
  const { data: preds } = await client
    .from('predictions')
    .select('id')
    .eq('user_id', userId)
    .in('fixture_id', favFixtureIds)
    .is('outcome', null)
    .limit(1)
  return (preds?.length ?? 0) > 0
}
