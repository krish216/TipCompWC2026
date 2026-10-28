import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { grantTickets } from '@/lib/sweep/tickets'

export const dynamic = 'force-dynamic'

// POST /api/tribes/:id/sweep/grant-tickets — comp-admin only. Records that a member has
// paid (collected offline — TribePicks never touches the money) and grants them N
// unclaimed tickets (sweep_entries rows, horse_id null) to spin for. Capped so the
// tribe's total tickets can never exceed the field size — a ticket with no horse left to
// possibly win isn't a ticket. Body: { user_id, count }.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const targetUserId = body?.user_id
  const count = Number(body?.count)
  if (!targetUserId || !Number.isInteger(count) || count < 1) {
    return NextResponse.json({ error: 'user_id and a positive integer count required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const tribeId = params.id

  const { data: tribe } = await (admin.from('tribes') as any)
    .select('id, comp_id, tournament_id').eq('id', tribeId).maybeSingle()
  if (!tribe) return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })

  const { data: tourn } = await (admin.from('tournaments') as any)
    .select('format').eq('id', tribe.tournament_id).maybeSingle()
  if ((tourn as any)?.format !== 'sweep') {
    return NextResponse.json({ error: 'This tribe is not a sweep' }, { status: 400 })
  }

  const { data: isAdmin } = await (admin.from('comp_admins') as any)
    .select('user_id').eq('comp_id', tribe.comp_id).eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return NextResponse.json({ error: 'Only a comp admin can grant tickets' }, { status: 403 })

  const { data: membership } = await (admin.from('tribe_members') as any)
    .select('user_id').eq('tribe_id', tribeId).eq('user_id', targetUserId).maybeSingle()
  if (!membership) return NextResponse.json({ error: 'That person is not a member of this pool' }, { status: 400 })

  const granted = await grantTickets(admin, { tribeId, tournamentId: tribe.tournament_id, userId: targetUserId, count })
  if (!granted.ok) return NextResponse.json({ error: granted.error }, { status: 400 })

  return NextResponse.json({ ok: true, granted: count })
}
