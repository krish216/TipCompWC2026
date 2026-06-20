import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/sponsors/auth'
import { toSlug } from '@/lib/sponsors/campaigns'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// PATCH /api/bracket/challenges/:id — admin: rename / re-slug / enable / disable.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await request.json().catch(() => ({}))
  const patch: Record<string, any> = {}

  if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim()
  if ('enabled' in b) patch.enabled = b.enabled !== false
  if (b.access === 'open' || b.access === 'invite') patch.access = b.access

  if (typeof b.slug === 'string' && b.slug.trim()) {
    const slug = toSlug(b.slug)
    const { data: clash } = await (admin.from('challenges') as any)
      .select('id').eq('slug', slug).neq('id', params.id).maybeSingle()
    if (clash) return NextResponse.json({ error: `Slug “${slug}” is already in use.` }, { status: 409 })
    patch.slug = slug
  }

  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await (admin.from('challenges') as any)
    .update(patch).eq('id', params.id).select('id, slug, name, enabled, access').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ challenge: data })
}

// DELETE /api/bracket/challenges/:id — admin: remove a challenge.
// NOTE: bracket_entries for this challenge are removed too (FK ON DELETE CASCADE).
// bracket_picks are tournament-scoped and untouched.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await (admin.from('challenges') as any).delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
