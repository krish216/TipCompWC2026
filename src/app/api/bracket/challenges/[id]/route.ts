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
  if ('closes_at' in b) patch.closes_at = b.closes_at || null
  if (Array.isArray(b.promote_surfaces)) {
    const allowed = new Set(['home', 'scoreboard'])
    patch.promote_surfaces = [...new Set(b.promote_surfaces.map((s: any) => String(s)).filter((s: string) => allowed.has(s)))]
  }

  if (typeof b.slug === 'string' && b.slug.trim()) {
    const slug = toSlug(b.slug)
    const { data: clash } = await (admin.from('challenges') as any)
      .select('id').eq('slug', slug).neq('id', params.id).maybeSingle()
    if (clash) return NextResponse.json({ error: `Slug “${slug}” is already in use.` }, { status: 409 })
    patch.slug = slug
  }

  // Match challenges: record the actual first-goal minute (tie-breaker) on the
  // linked fixture. Accepts a 0–130 int or null/'' to clear.
  if ('first_goal_min' in b) {
    const { data: ch } = await (admin.from('challenges') as any).select('fixture_id, type').eq('id', params.id).maybeSingle()
    if (!(ch as any)?.fixture_id) return NextResponse.json({ error: 'This challenge has no fixture.' }, { status: 400 })
    let fgm: number | null = null
    if (b.first_goal_min !== null && b.first_goal_min !== '') {
      const n = Number(b.first_goal_min)
      if (!Number.isInteger(n) || n < 0 || n > 130) return NextResponse.json({ error: 'First-goal minute must be 0–130.' }, { status: 422 })
      fgm = n
    }
    const { error: fxErr } = await (admin.from('fixtures') as any).update({ first_goal_min: fgm }).eq('id', (ch as any).fixture_id)
    if (fxErr) return NextResponse.json({ error: fxErr.message }, { status: 500 })
    if (!Object.keys(patch).length) return NextResponse.json({ ok: true, first_goal_min: fgm })
  }

  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await (admin.from('challenges') as any)
    .update(patch).eq('id', params.id).select('id, slug, name, enabled, access, closes_at').single()
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
