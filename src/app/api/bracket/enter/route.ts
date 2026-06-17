import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

async function activeTournamentId(admin: any): Promise<string | null> {
  const { data } = await admin.from('tournaments').select('id').eq('is_active', true).maybeSingle()
  return (data as any)?.id ?? null
}

// First R32 kick-off = when the bracket (and entry) locks.
async function closesAt(admin: any, tid: string): Promise<string | null> {
  const { data } = await admin.from('fixtures')
    .select('kickoff_utc').eq('tournament_id', tid).eq('round', 'r32')
    .order('kickoff_utc', { ascending: true }).limit(1)
  return (data as any)?.[0]?.kickoff_utc ?? null
}

async function hasChampion(admin: any, userId: string, tid: string): Promise<boolean> {
  const { data } = await admin.from('bracket_picks')
    .select('team_name').eq('user_id', userId).eq('tournament_id', tid).eq('slot_key', 'final')
    .not('team_name', 'is', null).maybeSingle()
  return !!data
}

// GET /api/bracket/enter — the caller's entry status (drives the Enter CTA).
export async function GET() {
  const user = await getSessionUser().catch(() => null)
  const admin = createAdminClient()
  const tid = await activeTournamentId(admin)
  if (!tid) return NextResponse.json({ available: false, logged_in: !!user })

  const closes_at = await closesAt(admin, tid)
  const locked = closes_at ? Date.now() >= new Date(closes_at).getTime() : false

  if (!user) return NextResponse.json({ available: true, logged_in: false, closes_at, locked })

  const has_bracket = await hasChampion(admin, user.id, tid)

  // Entry row — gracefully report unavailable if the table isn't migrated yet.
  let entry: any = null, available = true
  const { data, error } = await admin.from('bracket_entries')
    .select('final_goals, tp_goals, consent_marketing, entered_at')
    .eq('user_id', user.id).eq('tournament_id', tid).maybeSingle()
  if (error) available = false
  else entry = data

  return NextResponse.json({
    available, logged_in: true, has_bracket, entered: !!entry, entry, closes_at, locked,
  })
}

// POST /api/bracket/enter — member enters the prize comp.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Sign in to enter' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const finalGoals = Number(body.final_goals)
  const tpGoals    = Number(body.tp_goals)
  if (body.consent_terms !== true) return NextResponse.json({ error: 'Please accept the terms to enter.' }, { status: 400 })
  if (!Number.isInteger(finalGoals) || finalGoals < 0 || finalGoals > 20 ||
      !Number.isInteger(tpGoals)    || tpGoals    < 0 || tpGoals    > 20)
    return NextResponse.json({ error: 'Enter your tie-break goal totals (0–20).' }, { status: 422 })

  const admin = createAdminClient()
  const tid = await activeTournamentId(admin)
  if (!tid) return NextResponse.json({ error: 'No active tournament' }, { status: 400 })

  const closes_at = await closesAt(admin, tid)
  if (closes_at && Date.now() >= new Date(closes_at).getTime())
    return NextResponse.json({ error: 'Entries are closed — the knockouts have started.' }, { status: 409 })

  if (!(await hasChampion(admin, user.id, tid)))
    return NextResponse.json({ error: 'Complete your bracket (pick a champion) before entering.' }, { status: 400 })

  const { error } = await (admin.from('bracket_entries') as any).upsert({
    user_id:           user.id,
    tournament_id:     tid,
    final_goals:       finalGoals,
    tp_goals:          tpGoals,
    phone:             typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null,
    consent_terms:     true,
    consent_marketing: body.consent_marketing === true,
    source:            'member',
    updated_at:        new Date().toISOString(),
  }, { onConflict: 'user_id,tournament_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
