import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { practiceTournamentId } from '@/lib/sweep/practice'

export const dynamic = 'force-dynamic'

// POST /api/sweep/practice — start a practice sweep (migration 200). Anyone signed in can:
// they become its organiser AND are put in its pool, so one person can play both roles
// (request a ticket, approve it, spin, run the race). Friends can join via its invite link.
// Always one pool, a pretend $5 ticket, 70/20/10 — nothing here is ever charged or paid.
export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Sign in to start a practice sweep' }, { status: 401 })

  const admin = createAdminClient()
  const tournamentId = await practiceTournamentId(admin)
  if (!tournamentId) return NextResponse.json({ error: 'Practice sweeps are not set up yet' }, { status: 503 })

  const { data: me } = await (admin.from('users') as any).select('display_name').eq('id', user.id).maybeSingle()
  const firstName = ((me as any)?.display_name ?? 'My').split(' ')[0]
  const suffix = Math.random().toString(36).substring(2, 6)
  const code = (Math.random().toString(36).substring(2, 6) + Math.random().toString(36).substring(2, 6)).toUpperCase()

  // comps.name is unique, so tag each practice sweep with a short suffix.
  const { data: comp, error } = await (admin.from('comps') as any).insert({
    name: `🧪 ${firstName}'s practice sweep ${suffix}`,
    slug: `practice-${user.id.slice(0, 8)}-${suffix}`,
    invite_code: code,
    created_by: user.id,
    is_self_created: true,
    approved: true,
    tournament_id: tournamentId,
    visibility: 'private',
    is_discoverable: false,
    prize_type: 'pool',
    max_tribes: 1,
    sweep_ticket_price_cents: 500,
    sweep_prize_split: [70, 20, 10],
    allow_iou: true,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const compId = (comp as any).id

  await Promise.all([
    (admin.from('comp_admins') as any).upsert({ comp_id: compId, user_id: user.id }),
    (admin.from('user_comps') as any).upsert({ user_id: user.id, comp_id: compId }, { onConflict: 'user_id,comp_id' }),
  ])
  const { data: tribe, error: tribeError } = await (admin.from('tribes') as any).insert({
    name: 'Pool',
    created_by: user.id,
    invite_code: (Math.random().toString(36).substring(2, 10) + '1').toUpperCase().slice(0, 10),
    comp_id: compId,
    tournament_id: tournamentId,
    is_default: true,
  }).select('id').single()
  if (tribeError) return NextResponse.json({ error: tribeError.message }, { status: 500 })
  await (admin.from('tribe_members') as any).insert({ user_id: user.id, tribe_id: (tribe as any).id })

  return NextResponse.json({ data: { comp_id: compId, tribe_id: (tribe as any).id } }, { status: 201 })
}
