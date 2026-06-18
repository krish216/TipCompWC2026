// Shared: who hasn't tipped the currently-open round for a comp. Used by the
// engagement analytics endpoint and the free "nudge untipped" action.

export interface UntippedResult {
  round_code:     string | null
  round_name:     string | null
  deadline:       string | null
  total_tipsters: number
  tipped_count:   number
  untipped:       { user_id: string; display_name: string; email: string }[]
}

const EMPTY: UntippedResult = { round_code: null, round_name: null, deadline: null, total_tipsters: 0, tipped_count: 0, untipped: [] }

export async function untippedForOpenRound(admin: any, compId: string): Promise<UntippedResult> {
  const { data: compRow } = await (admin.from('comps') as any).select('tournament_id').eq('id', compId).single()
  const tournId: string | null = (compRow as any)?.tournament_id ?? null
  if (!tournId) return EMPTY

  // Open tipping round(s) — is_open is the sole gate; pick the lowest round_order.
  const { data: lockRows } = await (admin.from('round_locks') as any)
    .select('round_code, is_open').eq('tournament_id', tournId).eq('is_open', true)
  const openRoundCodes = ((lockRows ?? []) as any[]).map(r => r.round_code)
  if (!openRoundCodes.length) return EMPTY

  const { data: orderRows } = await (admin.from('tournament_rounds') as any)
    .select('round_code, round_name, round_order').eq('tournament_id', tournId)
    .in('round_code', openRoundCodes).order('round_order', { ascending: true })
  const firstRound = (orderRows as any[])?.[0]
  if (!firstRound) return EMPTY
  const roundCode: string = firstRound.round_code
  const roundName: string = firstRound.round_name ?? roundCode

  const { data: fixRows } = await admin.from('fixtures')
    .select('id, kickoff_utc').eq('round', roundCode).order('kickoff_utc', { ascending: true })
  const fixtureIds: number[] = ((fixRows ?? []) as any[]).map(f => f.id)
  const now = new Date()
  const upcoming = ((fixRows ?? []) as any[]).filter(f => new Date(f.kickoff_utc) > now)
  const deadline: string | null = upcoming[0]?.kickoff_utc ?? (fixRows as any[])?.[0]?.kickoff_utc ?? null
  if (!fixtureIds.length) return { ...EMPTY, round_code: roundCode, round_name: roundName, deadline }

  const { data: memberRows } = await (admin.from('user_comps') as any)
    .select('user_id, users(id, display_name, first_name, email)').eq('comp_id', compId)
  const members = ((memberRows ?? []) as any[]).map(m => ({
    user_id:      m.users?.id ?? m.user_id,
    display_name: m.users?.display_name ?? m.users?.first_name ?? 'Unknown',
    email:        m.users?.email ?? '',
  }))
  if (!members.length) return { ...EMPTY, round_code: roundCode, round_name: roundName, deadline }

  const memberIds = members.map(m => m.user_id)
  const { data: predRows } = await (admin.from('predictions') as any)
    .select('user_id').in('user_id', memberIds).in('fixture_id', fixtureIds)
  const tipped = new Set(((predRows ?? []) as any[]).map(p => p.user_id))
  const untipped = members.filter(m => !tipped.has(m.user_id))

  return { round_code: roundCode, round_name: roundName, deadline, total_tipsters: members.length, tipped_count: tipped.size, untipped }
}
