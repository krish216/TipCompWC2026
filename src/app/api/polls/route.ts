import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { activePollsForUser, tallyPoll } from '@/lib/polls'

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

// POST /api/polls — cast (or change) the signed-in user's vote.
// Body: { poll_id, option_idx }
export async function POST(request: NextRequest) {
  const user = await getSessionUser().catch(() => null)
  if (!user) return NextResponse.json({ error: 'Sign in to vote.' }, { status: 401 })

  const b = await request.json().catch(() => ({}))
  const pollId = typeof b.poll_id === 'string' ? b.poll_id : ''
  const optionIdx = Number(b.option_idx)
  if (!pollId || !Number.isInteger(optionIdx) || optionIdx < 0)
    return NextResponse.json({ error: 'Invalid vote.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: poll } = await (admin.from('polls') as any)
    .select('id, options, active, starts_at, ends_at').eq('id', pollId).maybeSingle()
  if (!poll) return NextResponse.json({ error: 'Poll not found.' }, { status: 404 })

  const nowIso = new Date().toISOString()
  const closed = !poll.active || (poll.ends_at && poll.ends_at < nowIso) || (poll.starts_at && poll.starts_at > nowIso)
  if (closed) return NextResponse.json({ error: 'This poll is closed.' }, { status: 409 })
  const opts = (poll.options ?? []) as string[]
  if (optionIdx >= opts.length) return NextResponse.json({ error: 'Invalid option.' }, { status: 422 })

  const { error } = await (admin.from('poll_votes') as any).upsert(
    { poll_id: pollId, user_id: user.id, option_idx: optionIdx, updated_at: nowIso },
    { onConflict: 'poll_id,user_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { tallies, total } = await tallyPoll(admin, pollId, opts.length)
  return NextResponse.json({ ok: true, my_vote: optionIdx, tallies, total })
}
