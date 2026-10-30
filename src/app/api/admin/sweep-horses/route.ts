import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { checkAndSendSweepResults } from '@/lib/sweep/results'
import { parseFinishOrder } from '@/lib/sweep/podium'

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
      .select('*')
      .eq('tournament_id', tournamentId).order('number', { ascending: true }),
    (admin.from('tournaments') as any).select('race_start_at').eq('id', tournamentId).maybeSingle(),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], race_start_at: (tourn as any)?.race_start_at ?? null })
}

// POST /api/admin/sweep-horses — add/replace the field in one go.
// Body: { tournament_id, horses: [{ number, name, barrier?, jockey?, trainer?, weight_kg? }] }
// The race-card details (migration 207) are only written when given, so re-pasting just
// "number, name" never wipes them.
export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const tournamentId = body?.tournament_id
  const horses = body?.horses
  if (!tournamentId || !Array.isArray(horses) || horses.length === 0) {
    return NextResponse.json({ error: 'tournament_id and a non-empty horses[] required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const text = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const num = (v: any) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
  const rows = horses.map((h: any) => {
    const row: Record<string, any> = { tournament_id: tournamentId, number: Number(h.number), name: String(h.name).trim() }
    if (num(h.barrier) != null)   row.barrier   = num(h.barrier)
    if (text(h.jockey))           row.jockey    = text(h.jockey)
    if (text(h.trainer))          row.trainer   = text(h.trainer)
    if (num(h.weight_kg) != null) row.weight_kg = num(h.weight_kg)
    return row
  })
  // One upsert per set of columns: a bulk upsert sets every column any row names, so a
  // "number, name" row in the same batch as detailed ones would blank its stored details.
  const groups = new Map<string, Record<string, any>[]>()
  for (const r of rows) { const k = Object.keys(r).sort().join(','); groups.set(k, [...(groups.get(k) ?? []), r]) }
  for (const group of groups.values()) {
    const { error } = await (admin.from('sweep_horses') as any).upsert(group, { onConflict: 'tournament_id,number' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, count: rows.length })
}

// PATCH /api/admin/sweep-horses — flip a scratching. (The result goes in all at once — PUT.)
// Body: { id, scratched }
export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const id = body?.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const update: Record<string, any> = {}
  if (typeof body.scratched === 'boolean') update.scratched = body.scratched
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await (admin.from('sweep_horses') as any).update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// PUT /api/admin/sweep-horses — the whole race result in one go (roll-down prizes need the
// full order, lib/sweep/podium.ts). Body: { tournament_id, order: "7, 3=12, 1, …", dnf: "5, 9" }
// — every non-scratched horse exactly once across the two; "=" is a dead heat. { clear: true }
// wipes the result. Once complete, every pool's results email goes out (once per pool).
export async function PUT(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const tournamentId = body?.tournament_id
  if (!tournamentId) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

  const admin = createAdminClient()
  if (body?.clear === true) {
    const { error } = await (admin.from('sweep_horses') as any)
      .update({ finish_position: null, did_not_finish: false }).eq('tournament_id', tournamentId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const parsed = parseFinishOrder(String(body?.order ?? ''))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const dnf = String(body?.dnf ?? '').split(/[,\s]+/).filter(Boolean).map(Number)
  if (dnf.some(n => !Number.isInteger(n) || n < 1)) return NextResponse.json({ error: 'Did-not-finish must be horse numbers.' }, { status: 400 })

  const { data: horses } = await (admin.from('sweep_horses') as any)
    .select('id, number, scratched').eq('tournament_id', tournamentId)
  const byNumber = new Map(((horses ?? []) as any[]).map(h => [h.number, h]))
  const seen = new Set<number>()
  for (const n of [...parsed.order.map(([num]) => num), ...dnf]) {
    const h = byNumber.get(n)
    if (!h) return NextResponse.json({ error: `There's no horse #${n} in the field.` }, { status: 400 })
    if (h.scratched) return NextResponse.json({ error: `#${n} is scratched — leave it out.` }, { status: 400 })
    if (seen.has(n)) return NextResponse.json({ error: `#${n} is listed twice.` }, { status: 400 })
    seen.add(n)
  }
  const missing = ((horses ?? []) as any[]).filter(h => !h.scratched && !seen.has(h.number)).map(h => `#${h.number}`)
  if (missing.length) {
    return NextResponse.json({ error: `Every runner needs a place or "did not finish" — missing ${missing.join(', ')}.` }, { status: 400 })
  }

  const position = new Map(parsed.order)
  const dnfSet = new Set(dnf)
  for (const h of (horses ?? []) as any[]) {
    const { error } = await (admin.from('sweep_horses') as any).update({
      finish_position: position.get(h.number) ?? null,
      did_not_finish:  dnfSet.has(h.number),
    }).eq('id', h.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await checkAndSendSweepResults(admin, tournamentId)
  return NextResponse.json({ ok: true })
}
