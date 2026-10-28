import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { checkAndSendSweepResults } from '@/lib/sweep/results'

export const dynamic = 'force-dynamic'

// Platform-admin only — the race field is shared across every comp/tribe sweep, entered
// centrally once (not per organisation). Same admin_users check as the rest of /api/admin.
async function requireAdmin() {
  const user = await getSessionUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle()
  return data ? user.id : null
}

// GET /api/admin/sweep-horses?tournament_id= — list the field + the tournament's race_start_at
// (the auto-lock trigger time, set here alongside the field itself).
export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tournamentId = new URL(request.url).searchParams.get('tournament_id')
  if (!tournamentId) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

  const admin = createAdminClient()
  const [{ data, error }, { data: tourn }] = await Promise.all([
    (admin.from('sweep_horses') as any)
      .select('id, number, name, scratched, finish_position')
      .eq('tournament_id', tournamentId).order('number', { ascending: true }),
    (admin.from('tournaments') as any).select('race_start_at').eq('id', tournamentId).maybeSingle(),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], race_start_at: (tourn as any)?.race_start_at ?? null })
}

// POST /api/admin/sweep-horses — add/replace the field in one go.
// Body: { tournament_id, horses: [{ number, name }] }
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const tournamentId = body?.tournament_id
  const horses = body?.horses
  if (!tournamentId || !Array.isArray(horses) || horses.length === 0) {
    return NextResponse.json({ error: 'tournament_id and a non-empty horses[] required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const rows = horses.map((h: any) => ({
    tournament_id: tournamentId,
    number: Number(h.number),
    name: String(h.name).trim(),
  }))
  const { error } = await (admin.from('sweep_horses') as any).upsert(rows, { onConflict: 'tournament_id,number' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: rows.length })
}

// PATCH /api/admin/sweep-horses — flip a scratching or set a race result.
// Body: { id, scratched? , finish_position? }
export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const id = body?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const update: Record<string, any> = {}
  if (typeof body.scratched === 'boolean') update.scratched = body.scratched
  if (body.finish_position === null || typeof body.finish_position === 'number') update.finish_position = body.finish_position
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const admin = createAdminClient()
  const { data: horse, error } = await (admin.from('sweep_horses') as any).update(update).eq('id', id).select('tournament_id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A finish_position set here might be the last of the top 3 — check if every tribe
  // under this tournament can now get its results email (idempotent per tribe).
  if (typeof update.finish_position === 'number' && (horse as any)?.tournament_id) {
    await checkAndSendSweepResults(admin, (horse as any).tournament_id)
  }

  return NextResponse.json({ ok: true })
}
