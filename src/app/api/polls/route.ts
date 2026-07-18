import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { activePollsForUser, tallyPoll, tallyRank, tallyMulti } from '@/lib/polls'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/polls — active polls for the signed-in user (logged-in only), each with
// the user's own vote + current tallies.
export async function GET() {
  const user = await getSessionUser().catch(() => null)
  if (!user) return NextResponse.json({ polls: [] })
  const admin = createAdminClient()
  const polls = await activePollsForUser(admin, user.id)
  return NextResponse.json({ polls })
}

// POST /api/polls — cast (or change) the signed-in user's response.
// Single poll:  { poll_id, option_idx }
// Multi poll:   { poll_id, choices: number[] }        (up to max_select)
// Ranked poll:  { poll_id, ranking: number[], note? }
export async function POST(request: NextRequest) {
  const user = await getSessionUser().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Sign in to vote.' }, { status: 401 })

  const b = await request.json().catch(() => ({}))
  const pollId = typeof b.poll_id === 'string' ? b.poll_id : ''
  if (!pollId) return NextResponse.json({ error: 'Invalid vote.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: poll } = await (admin.from('polls') as any)
    .select('id, kind, max_select, options, active, starts_at, ends_at').eq('id', pollId).maybeSingle()
  if (!poll) return NextResponse.json({ error: 'Poll not found.' }, { status: 404 })

  const nowIso = new Date().toISOString()
  const closed = !poll.active || (poll.ends_at && poll.ends_at < nowIso) || (poll.starts_at && poll.starts_at > nowIso)
  if (closed) return NextResponse.json({ error: 'This poll is closed.' }, { status: 409 })
  const opts = (poll.options ?? []) as string[]

  // ── Ranked poll ──────────────────────────────────────────────
  if (poll.kind === 'rank') {
    const ranking = Array.isArray(b.ranking) ? b.ranking.map(Number) : null
    // Must be a full permutation of 0..N-1 (each option ranked exactly once).
    const valid = ranking
      && ranking.length === opts.length
      && ranking.every((n: number) => Number.isInteger(n) && n >= 0 && n < opts.length)
      && new Set(ranking).size === opts.length
    if (!valid) return NextResponse.json({ error: 'Invalid ranking.' }, { status: 422 })
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 280) || null : null

    const { error } = await (admin.from('poll_votes') as any).upsert(
      { poll_id: pollId, user_id: user.id, option_idx: null, ranking, note, updated_at: nowIso },
      { onConflict: 'poll_id,user_id' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { rankAvg, count } = await tallyRank(admin, pollId, opts.length)
    return NextResponse.json({ ok: true, my_ranking: ranking, note, rank_avg: rankAvg, total: count })
  }

  // ── Open free-text poll ──────────────────────────────────────
  if (poll.kind === 'text') {
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 1000) : ''
    if (!note) return NextResponse.json({ error: 'Write something first.' }, { status: 422 })
    const { error } = await (admin.from('poll_votes') as any).upsert(
      { poll_id: pollId, user_id: user.id, option_idx: null, ranking: null, note, updated_at: nowIso },
      { onConflict: 'poll_id,user_id' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, note })
  }

  // ── Multi-select poll ────────────────────────────────────────
  if (poll.kind === 'multi') {
    const choices = Array.isArray(b.choices) ? b.choices.map(Number) : null
    const cap = poll.max_select && poll.max_select > 0 ? poll.max_select : opts.length
    const valid = choices
      && choices.length >= 1 && choices.length <= cap
      && choices.every((n: number) => Number.isInteger(n) && n >= 0 && n < opts.length)
      && new Set(choices).size === choices.length
    if (!valid) return NextResponse.json({ error: `Pick 1–${cap} options.` }, { status: 422 })
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 280) || null : null

    const { error } = await (admin.from('poll_votes') as any).upsert(
      { poll_id: pollId, user_id: user.id, option_idx: null, ranking: choices, note, updated_at: nowIso },
      { onConflict: 'poll_id,user_id' },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { tallies, total } = await tallyMulti(admin, pollId, opts.length)
    return NextResponse.json({ ok: true, my_choices: choices, note, tallies, total })
  }

  // ── Single poll ──────────────────────────────────────────────
  const optionIdx = Number(b.option_idx)
  if (!Number.isInteger(optionIdx) || optionIdx < 0 || optionIdx >= opts.length)
    return NextResponse.json({ error: 'Invalid option.' }, { status: 422 })

  const { error } = await (admin.from('poll_votes') as any).upsert(
    { poll_id: pollId, user_id: user.id, option_idx: optionIdx, ranking: null, updated_at: nowIso },
    { onConflict: 'poll_id,user_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { tallies, total } = await tallyPoll(admin, pollId, opts.length)
  return NextResponse.json({ ok: true, my_vote: optionIdx, tallies, total })
}
