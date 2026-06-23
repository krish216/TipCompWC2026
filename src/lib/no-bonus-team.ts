// Shared: comp members who haven't picked a Bonus (favourite) team for the comp's
// tournament, plus whether the bonus picker is still open. Used by the engagement
// analytics endpoint and the free "nudge no-bonus" comp-admin action.
//
// Mirrors src/lib/untipped.ts. Bonus team lives on user_tournaments.favourite_team
// (per tournament, not per comp), gated by app_settings.bonus_lock_at (else the
// first-match kickoff). Past the lock, picking is closed → nothing to chase.

const DEFAULT_KICKOFF = '2026-06-11T19:00:00Z'  // first WC2026 match — default bonus lock

export interface NoBonusResult {
  locked:    boolean
  lock_at:   string | null   // ISO; the bonus-pick deadline
  total:     number          // comp members considered
  set_count: number          // members who have picked a bonus team
  missing:   { user_id: string; display_name: string; email: string }[]
}

const EMPTY: NoBonusResult = { locked: true, lock_at: null, total: 0, set_count: 0, missing: [] }

export async function noBonusTeamForComp(admin: any, compId: string): Promise<NoBonusResult> {
  const { data: compRow } = await (admin.from('comps') as any).select('tournament_id').eq('id', compId).single()
  const tournId: string | null = (compRow as any)?.tournament_id ?? null
  if (!tournId) return EMPTY

  // Bonus-pick lock: app_settings.bonus_lock_at override, else default kickoff.
  const { data: lockRow } = await (admin.from('app_settings') as any).select('value').eq('key', 'bonus_lock_at').maybeSingle()
  const lockAt: string = (lockRow as any)?.value ?? DEFAULT_KICKOFF
  const locked = Date.now() >= new Date(lockAt).getTime()

  const { data: memberRows } = await (admin.from('user_comps') as any)
    .select('user_id, users(id, display_name, first_name, email)').eq('comp_id', compId)
  const members = ((memberRows ?? []) as any[]).map(m => ({
    user_id:      m.users?.id ?? m.user_id,
    display_name: m.users?.display_name ?? m.users?.first_name ?? 'Unknown',
    email:        m.users?.email ?? '',
  }))
  if (!members.length) return { locked, lock_at: lockAt, total: 0, set_count: 0, missing: [] }

  const memberIds = members.map(m => m.user_id)
  const { data: utRows } = await (admin.from('user_tournaments') as any)
    .select('user_id, favourite_team').eq('tournament_id', tournId).in('user_id', memberIds)
  const hasTeam = new Set(((utRows ?? []) as any[]).filter(r => r.favourite_team).map(r => r.user_id))
  const missing = members.filter(m => !hasTeam.has(m.user_id))

  return { locked, lock_at: lockAt, total: members.length, set_count: hasTeam.size, missing }
}
