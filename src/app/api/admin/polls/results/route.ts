import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/sponsors/auth'
import { tallyPoll, tallyMulti, tallyRank } from '@/lib/polls'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/admin/polls/results — every poll with its results: per-option tallies (single/multi),
// average ranks (rank), and free-text answers (text, plus any "something else" note on
// single/multi/rank). Admin only. Powers /admin/polls/results.
export async function GET() {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: polls } = await (admin.from('polls') as any)
    .select('id, topic, kind, question, options, active, created_at')
    .order('topic', { ascending: true }).order('created_at', { ascending: true })

  const notesFor = async (id: string): Promise<string[]> => {
    const { data } = await (admin.from('poll_votes') as any).select('note').eq('poll_id', id).not('note', 'is', null)
    return ((data ?? []) as any[]).map(r => (r.note || '').trim()).filter(Boolean)
  }

  const out: any[] = []
  for (const p of ((polls ?? []) as any[])) {
    const opts = (p.options ?? []) as string[]
    const kind = p.kind ?? 'single'
    const base = { id: p.id, topic: p.topic, question: p.question, active: p.active, kind, options: opts }

    if (kind === 'text') {
      const notes = await notesFor(p.id)
      out.push({ ...base, total: notes.length, tallies: [], rankAvg: [], notes })
    } else if (kind === 'multi') {
      const { tallies, total } = await tallyMulti(admin, p.id, opts.length)
      out.push({ ...base, total, tallies, rankAvg: [], notes: await notesFor(p.id) })
    } else if (kind === 'rank') {
      const { rankAvg, count } = await tallyRank(admin, p.id, opts.length)
      out.push({ ...base, total: count, tallies: [], rankAvg, notes: await notesFor(p.id) })
    } else {
      const { tallies, total } = await tallyPoll(admin, p.id, opts.length)
      out.push({ ...base, total, tallies, rankAvg: [], notes: [] })
    }
  }
  return NextResponse.json({ polls: out })
}
