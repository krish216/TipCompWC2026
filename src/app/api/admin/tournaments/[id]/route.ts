import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/sponsors/auth'

export const dynamic = 'force-dynamic'

// PATCH /api/admin/tournaments/:id — platform-admin only. Currently just race_start_at (the
// precise race-jump timestamp a sweep auto-locks 30 minutes ahead of — tournaments.start_date
// is date-only). Kept separate from /api/admin/sweep-horses (horse-specific) since this is a
// tournament-level field that may grow to cover other admin-settable tournament fields later.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!('race_start_at' in (body ?? {}))) {
    return NextResponse.json({ error: 'race_start_at required (ISO string or null)' }, { status: 400 })
  }
  const raceStartAt = body.race_start_at ? new Date(body.race_start_at).toISOString() : null

  const { error } = await (admin.from('tournaments') as any)
    .update({ race_start_at: raceStartAt }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, race_start_at: raceStartAt })
}
