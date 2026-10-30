import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function requireTribeAdmin(admin: any, tribeId: string, userId: string) {
  const { data: tribe } = await admin.from('tribes')
    .select('id, comp_id, tournament_id, sweep_locked_at').eq('id', tribeId).maybeSingle()
  if (!tribe) return { ok: false as const, status: 404, error: 'Pool not found' }

  const { data: tourn } = await admin.from('tournaments').select('format').eq('id', tribe.tournament_id).maybeSingle()
  if ((tourn as any)?.format !== 'sweep') return { ok: false as const, status: 400, error: 'This pool is not a sweep' }

  const { data: isAdmin } = await admin.from('comp_admins')
    .select('user_id').eq('comp_id', tribe.comp_id).eq('user_id', userId).maybeSingle()
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Only a comp admin can manage this pool' }

  return { ok: true as const, tribe }
}

// POST /api/tribes/:id/sweep/lock — comp-admin only. Stops new members joining THIS pool
// (feeds the self-register overflow routing, which skips a locked tribe). Does NOT touch
// tickets/picks at all — the organiser can still buy for members (sweep/buy-on-behalf), before
// or after lock, to whoever's already a member.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const gate = await requireTribeAdmin(admin, params.id, user.id)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (gate.tribe.sweep_locked_at) return NextResponse.json({ error: 'This pool is already locked' }, { status: 409 })

  const { error: lockErr } = await (admin.from('tribes') as any)
    .update({ sweep_locked_at: new Date().toISOString() }).eq('id', params.id).is('sweep_locked_at', null)
  if (lockErr) return NextResponse.json({ error: lockErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// DELETE /api/tribes/:id/sweep/lock — comp-admin only. Reopens the pool to new joins —
// originally "not re-runnable" by design, but an organiser who locks by mistake (or just
// changes their mind) had no way back except a raw DB edit. Doesn't touch tickets/entries
// either way — including any horses drawn by the auto-lock-30-min-before-race cron or a
// prior "Close pool" — those stand; this only reopens
// joining.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const gate = await requireTribeAdmin(admin, params.id, user.id)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (!gate.tribe.sweep_locked_at) return NextResponse.json({ error: 'This pool isn’t locked' }, { status: 409 })

  const { error: unlockErr } = await (admin.from('tribes') as any)
    .update({ sweep_locked_at: null }).eq('id', params.id)
  if (unlockErr) return NextResponse.json({ error: unlockErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
