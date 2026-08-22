import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/sponsors/auth'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET  /api/admin/petzbff-wheel — live monitor: config, inventory, entrant count, recent leads,
//                                 and when each scarce prize actually went out.
// POST /api/admin/petzbff-wheel — set the show window + active flag, then rebuild the unlock
//                                 schedule. Admin only. Powers /admin/petzbff-wheel.

export async function GET(request: NextRequest) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // CSV export of every entrant (the full lead list), for the mailing list.
  if (new URL(request.url).searchParams.get('format') === 'csv') {
    const { data } = await (admin.from('petzbff_wheel_spins') as any)
      .select('email, prize_label, source, consent, created_at').order('created_at', { ascending: false })
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = ['email,prize,source,consent,captured_at',
      ...((data ?? []) as any[]).map(r => [r.email, r.prize_label, r.source, r.consent, r.created_at].map(esc).join(','))]
    return new NextResponse(rows.join('\n'), {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="petzbff-wheel-entrants.csv"' },
    })
  }

  const [cfg, prizes, spins, unlocks] = await Promise.all([
    (admin.from('petzbff_wheel_config') as any).select('*').eq('id', true).maybeSingle(),
    (admin.from('petzbff_wheel_prizes') as any).select('*').order('sort', { ascending: true }),
    (admin.from('petzbff_wheel_spins') as any).select('email, prize_label, source, created_at').order('created_at', { ascending: false }).limit(50),
    (admin.from('petzbff_wheel_unlocks') as any).select('prize_id, unlock_at, claimed_by').order('unlock_at', { ascending: true }),
  ])

  const { count: total } = await (admin.from('petzbff_wheel_spins') as any).select('*', { count: 'exact', head: true })

  return NextResponse.json({
    config:   cfg.data ?? null,
    prizes:   prizes.data ?? [],
    unlocks:  unlocks.data ?? [],
    recent:   spins.data ?? [],
    entrants: total ?? 0,
  })
}

export async function POST(request: NextRequest) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }

  const startsAt = body?.showStartsAt, endsAt = body?.showEndsAt, active = !!body?.active
  if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
    return NextResponse.json({ error: 'End must be after start' }, { status: 400 })
  }

  const { error: upErr } = await (admin.from('petzbff_wheel_config') as any).upsert({
    id: true, show_starts_at: startsAt, show_ends_at: endsAt, active, updated_at: new Date().toISOString(),
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Rebuild the staggered unlock schedule from the new window (clears only unclaimed unlocks).
  const { data: made, error: rpcErr } = await (admin.rpc as any)('petzbff_wheel_reschedule')
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, unlocksScheduled: made })
}
