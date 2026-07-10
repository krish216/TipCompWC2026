import { NextRequest, NextResponse } from 'next/server'
import { getPrimaryTournament } from '@/lib/content/wc'
import { requireAdmin } from '@/lib/sponsors/auth'

export const dynamic = 'force-dynamic'

// PATCH /api/admin/polls/:id — close/reopen, edit window, or edit content.
// Body: { active?, ends_at?, question?, description?, topic?, audience?, options? }
// Options can only change while the poll has zero votes (votes store the option index).
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await request.json().catch(() => ({}))
  const patch: Record<string, any> = {}

  if ('active' in b) patch.active = b.active !== false
  if ('ends_at' in b) patch.ends_at = b.ends_at || null
  if (typeof b.question === 'string' && b.question.trim()) patch.question = b.question.trim()
  if ('description' in b) patch.description = (typeof b.description === 'string' && b.description.trim()) ? b.description.trim() : null
  if (typeof b.topic === 'string' && b.topic.trim()) patch.topic = b.topic.trim()
  if (b.audience === 'all' || b.audience === 'tournament') {
    patch.audience = b.audience
    if (b.audience === 'tournament') {
      const t = await getPrimaryTournament(admin)
      patch.tournament_id = (t as any)?.id ?? null
    }
  }

  // Options: guarded — only editable before anyone has voted.
  if (Array.isArray(b.options)) {
    const opts = b.options.map((o: any) => String(o).trim()).filter(Boolean)
    if (opts.length < 2) return NextResponse.json({ error: 'Add at least two options.' }, { status: 422 })
    const { count } = await (admin.from('poll_votes') as any).select('id', { count: 'exact', head: true }).eq('poll_id', params.id)
    if ((count ?? 0) > 0) return NextResponse.json({ error: `Can't change options after voting has started (${count} vote${count === 1 ? '' : 's'}). Edit the wording, or delete and recreate.` }, { status: 409 })
    patch.options = opts
  }

  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { error } = await (admin.from('polls') as any).update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/polls/:id — remove a poll (its votes cascade).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { error } = await (admin.from('polls') as any).delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
