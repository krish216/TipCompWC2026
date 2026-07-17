// Poll helpers — shared by the public poll API and the admin manager. All reads go
// through the service-role admin client (RLS is defense-in-depth for direct access).

import { getPrimaryTournament } from '@/lib/content/wc'

export interface PollView {
  id: string
  topic: string
  question: string
  description: string | null
  options: string[]
  ends_at: string | null
  my_vote: number | null      // option_idx the user picked, or null
  tallies: number[]           // vote count per option (aligned to options)
  total: number
}

// Count votes per option for a poll. Returns an array aligned to options length.
export async function tallyPoll(admin: any, pollId: string, optionCount: number): Promise<{ tallies: number[]; total: number }> {
  const { data } = await (admin.from('poll_votes') as any).select('option_idx').eq('poll_id', pollId)
  const tallies = new Array(optionCount).fill(0)
  let total = 0
  for (const v of (data ?? []) as any[]) {
    const i = v.option_idx
    if (i >= 0 && i < optionCount) { tallies[i]++; total++ }
  }
  return { tallies, total }
}

// The user's tournament (for audience === 'tournament'); falls back to the active one.
export async function userTournamentId(admin: any, userId: string): Promise<string | null> {
  const { data: u } = await (admin.from('users') as any).select('tournament_id').eq('id', userId).maybeSingle()
  if ((u as any)?.tournament_id) return (u as any).tournament_id
  const t = await getPrimaryTournament(admin)
  return (t as any)?.id ?? null
}

// The comps the user belongs to (for audience === 'comp').
export async function userCompIds(admin: any, userId: string): Promise<Set<string>> {
  const { data } = await (admin.from('user_comps') as any).select('comp_id').eq('user_id', userId)
  return new Set(((data ?? []) as any[]).map(r => r.comp_id as string))
}

// Active polls visible to a user right now (within their window + audience), each with
// the user's own vote and current tallies.
export async function activePollsForUser(admin: any, userId: string): Promise<PollView[]> {
  const tid = await userTournamentId(admin, userId)
  const compIds = await userCompIds(admin, userId)
  const nowIso = new Date().toISOString()

  const { data: rows } = await (admin.from('polls') as any)
    .select('id, topic, question, description, options, audience, tournament_id, comp_id, starts_at, ends_at')
    .eq('active', true)
    .order('created_at', { ascending: false })

  const live = ((rows ?? []) as any[]).filter(p => {
    if (p.starts_at && p.starts_at > nowIso) return false
    if (p.ends_at && p.ends_at < nowIso) return false
    if (p.audience === 'tournament') return p.tournament_id && p.tournament_id === tid
    if (p.audience === 'comp')       return p.comp_id && compIds.has(p.comp_id)
    return true
  })
  if (!live.length) return []

  // The user's votes across these polls (one round-trip).
  const ids = live.map(p => p.id)
  const { data: votes } = await (admin.from('poll_votes') as any)
    .select('poll_id, option_idx').eq('user_id', userId).in('poll_id', ids)
  const myVote = new Map<string, number>()
  for (const v of (votes ?? []) as any[]) myVote.set(v.poll_id, v.option_idx)

  const out: PollView[] = []
  for (const p of live) {
    const opts = (p.options ?? []) as string[]
    const { tallies, total } = await tallyPoll(admin, p.id, opts.length)
    out.push({
      id: p.id, topic: p.topic, question: p.question, description: p.description ?? null, options: opts,
      ends_at: p.ends_at ?? null,
      my_vote: myVote.has(p.id) ? (myVote.get(p.id) as number) : null,
      tallies, total,
    })
  }
  return out
}
