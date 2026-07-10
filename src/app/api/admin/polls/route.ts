import { NextRequest, NextResponse } from 'next/server'
import { getPrimaryTournament } from '@/lib/content/wc'
import { requireAdmin } from '@/lib/sponsors/auth'
import { tallyPoll } from '@/lib/polls'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/admin/polls — all polls (active + closed) with vote tallies.
export async function GET() {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: rows } = await (admin.from('polls') as any)
    .select('id, topic, question, description, options, audience, tournament_id, active, starts_at, ends_at, created_at')
    .order('created_at', { ascending: false })

  const polls = await Promise.all(((rows ?? []) as any[]).map(async p => {
    const opts = (p.options ?? []) as string[]
    const { tallies, total } = await tallyPoll(admin, p.id, opts.length)
    return { ...p, tallies, total }
  }))
  return NextResponse.json({ polls })
}

// POST /api/admin/polls — create a poll.
// Body: { question, options[], topic?, audience?, tournament_id?, ends_at?, active? }
export async function POST(request: NextRequest) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await request.json().catch(() => ({}))
  const question = typeof b.question === 'string' ? b.question.trim() : ''
  const options = Array.isArray(b.options) ? b.options.map((o: any) => String(o).trim()).filter(Boolean) : []
  if (!question) return NextResponse.json({ error: 'Question required.' }, { status: 400 })
  if (options.length < 2) return NextResponse.json({ error: 'Add at least two options.' }, { status: 422 })

  const audience = b.audience === 'tournament' ? 'tournament' : 'all'
  let tournamentId: string | null = typeof b.tournament_id === 'string' && b.tournament_id ? b.tournament_id : null
  if (audience === 'tournament' && !tournamentId) {
    const t = await getPrimaryTournament(admin)
    tournamentId = (t as any)?.id ?? null
  }

  const { data, error } = await (admin.from('polls') as any).insert({
    question,
    description:   typeof b.description === 'string' && b.description.trim() ? b.description.trim() : null,
    options,
    topic:         typeof b.topic === 'string' && b.topic.trim() ? b.topic.trim() : 'general',
    audience,
    tournament_id: tournamentId,
    ends_at:       b.ends_at || null,
    active:        b.active !== false,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, poll: data })
}
