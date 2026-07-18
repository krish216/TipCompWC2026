// Poll helpers — shared by the public poll API and the admin manager. All reads go
// through the service-role admin client (RLS is defense-in-depth for direct access).

import { getPrimaryTournament } from '@/lib/content/wc'

export interface PollView {
  id: string
  topic: string
  kind: 'single' | 'multi' | 'rank' | 'text'   // one-tap | pick up to N | order | open free-text
  max_select: number | null           // multi polls: max options a user may pick (null = 1/unlimited)
  question: string
  description: string | null
  options: string[]
  ends_at: string | null
  my_vote: number | null      // option_idx the user picked, or null (single polls)
  tallies: number[]           // count per option (single: votes; multi: how many picked it)
  total: number               // respondents (single: votes cast; multi/rank: users who answered)
  // Multi + ranked polls (the user's selection/order lives in `my_ranking`):
  my_ranking: number[] | null           // multi = chosen option indices; rank = order (best-first)
  rank_avg: (number | null)[] | null    // rank polls: mean 1-based position per option (lower = better)
  note: string | null                   // the user's own free-text note (e.g. their 'Other' cause)
  // The tournament this poll is contextually tied to: a tournament poll's own tournament,
  // or a comp poll's comp tournament; null for audience 'all'. Lets the homepage card hide a
  // poll when a different tournament is selected (e.g. an EPL comp poll while viewing the WC).
  tournament_id: string | null
}

// Count votes per option for a single-choice poll. Returns an array aligned to options length.
export async function tallyPoll(admin: any, pollId: string, optionCount: number): Promise<{ tallies: number[]; total: number }> {
  const { data } = await (admin.from('poll_votes') as any).select('option_idx').eq('poll_id', pollId)
  const tallies = new Array(optionCount).fill(0)
  let total = 0
  for (const v of (data ?? []) as any[]) {
    const i = v.option_idx
    if (i != null && i >= 0 && i < optionCount) { tallies[i]++; total++ }
  }
  return { tallies, total }
}

// Count how many respondents picked each option for a multi-select poll. `total` is the
// number of users who submitted at least one choice (so per-option share = tallies[i]/total).
export async function tallyMulti(admin: any, pollId: string, optionCount: number): Promise<{ tallies: number[]; total: number }> {
  const { data } = await (admin.from('poll_votes') as any).select('ranking').eq('poll_id', pollId)
  const tallies = new Array(optionCount).fill(0)
  let total = 0
  for (const v of (data ?? []) as any[]) {
    const r = v.ranking as number[] | null
    if (!Array.isArray(r) || !r.length) continue
    total++
    const seen = new Set<number>()
    for (const i of r) if (i != null && i >= 0 && i < optionCount && !seen.has(i)) { tallies[i]++; seen.add(i) }
  }
  return { tallies, total }
}

// Average 1-based position per option for a ranked poll (lower = ranked more important).
// `count` is the number of users who submitted a ranking.
export async function tallyRank(admin: any, pollId: string, optionCount: number): Promise<{ rankAvg: (number | null)[]; count: number }> {
  const { data } = await (admin.from('poll_votes') as any).select('ranking').eq('poll_id', pollId)
  const sum = new Array(optionCount).fill(0)
  const cnt = new Array(optionCount).fill(0)
  let count = 0
  for (const v of (data ?? []) as any[]) {
    const r = v.ranking as number[] | null
    if (!Array.isArray(r) || !r.length) continue
    count++
    r.forEach((opt, pos) => { if (opt != null && opt >= 0 && opt < optionCount) { sum[opt] += pos + 1; cnt[opt]++ } })
  }
  const rankAvg = sum.map((s, i) => (cnt[i] ? s / cnt[i] : null))
  return { rankAvg, count }
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
    .select('id, topic, kind, max_select, question, description, options, audience, tournament_id, comp_id, starts_at, ends_at')
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

  // The user's votes across these polls (one round-trip) — single (option_idx) + ranked (ranking) + note.
  const ids = live.map(p => p.id)
  const { data: votes } = await (admin.from('poll_votes') as any)
    .select('poll_id, option_idx, ranking, note').eq('user_id', userId).in('poll_id', ids)
  const myVote = new Map<string, number>()
  const myRank = new Map<string, number[]>()
  const myNote = new Map<string, string>()
  for (const v of (votes ?? []) as any[]) {
    if (v.option_idx != null) myVote.set(v.poll_id, v.option_idx)
    if (Array.isArray(v.ranking)) myRank.set(v.poll_id, v.ranking as number[])
    if (v.note != null) myNote.set(v.poll_id, v.note as string)
  }

  // Contextual tournament per poll: comp polls resolve to their comp's tournament.
  const compTourn = new Map<string, string>()
  const compIdsToResolve = Array.from(new Set(live.filter(p => p.audience === 'comp' && p.comp_id).map(p => p.comp_id as string)))
  if (compIdsToResolve.length) {
    const { data: comps } = await (admin.from('comps') as any).select('id, tournament_id').in('id', compIdsToResolve)
    for (const c of (comps ?? []) as any[]) if (c.tournament_id) compTourn.set(c.id, c.tournament_id)
  }
  const pollTournamentId = (p: any): string | null =>
    p.audience === 'tournament' ? (p.tournament_id ?? null)
    : p.audience === 'comp'     ? (compTourn.get(p.comp_id) ?? null)
    : null

  const out: PollView[] = []
  for (const p of live) {
    const opts = (p.options ?? []) as string[]
    const kind: 'single' | 'multi' | 'rank' | 'text' =
      p.kind === 'rank' ? 'rank' : p.kind === 'multi' ? 'multi' : p.kind === 'text' ? 'text' : 'single'
    const base = {
      id: p.id, topic: p.topic, kind, max_select: p.max_select ?? null,
      question: p.question, description: p.description ?? null, options: opts,
      ends_at: p.ends_at ?? null,
      note: myNote.has(p.id) ? (myNote.get(p.id) as string) : null,
      tournament_id: pollTournamentId(p),
    }
    if (kind === 'text') {
      // Open free-text: nothing to aggregate for the user; total = number of responses left.
      const { data: notes } = await (admin.from('poll_votes') as any).select('note').eq('poll_id', p.id)
      const total = ((notes ?? []) as any[]).filter(v => v.note != null && String(v.note).trim() !== '').length
      out.push({ ...base, my_vote: null, tallies: [], total, my_ranking: null, rank_avg: null })
    } else if (kind === 'rank') {
      const { rankAvg, count } = await tallyRank(admin, p.id, opts.length)
      out.push({
        ...base,
        my_vote: null, tallies: [], total: count,
        my_ranking: myRank.has(p.id) ? (myRank.get(p.id) as number[]) : null,
        rank_avg: rankAvg,
      })
    } else if (kind === 'multi') {
      const { tallies, total } = await tallyMulti(admin, p.id, opts.length)
      out.push({
        ...base,
        my_vote: null, tallies, total,
        my_ranking: myRank.has(p.id) ? (myRank.get(p.id) as number[]) : null,   // multi selections
        rank_avg: null,
      })
    } else {
      const { tallies, total } = await tallyPoll(admin, p.id, opts.length)
      out.push({
        ...base,
        my_vote: myVote.has(p.id) ? (myVote.get(p.id) as number) : null,
        tallies, total,
        my_ranking: null, rank_avg: null,
      })
    }
  }
  return out
}
