import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/comp-invitations/pending
// Returns pending comp invitations for the current user's email,
// filtered against any comps they've blocked at the tournament level.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Resolve user email from the users table
  const { data: userRow } = await admin
    .from('users').select('email').eq('id', user.id).single()
  const email = (userRow as any)?.email ?? user.email
  if (!email) return NextResponse.json({ data: [] })

  // Fetch pending invitations (not yet joined)
  const { data: invRows } = await (admin.from('comp_invitations') as any)
    .select('id, comp_id, invited_at')
    .ilike('email', email)
    .is('joined_at', null)

  if (!invRows?.length) return NextResponse.json({ data: [] })

  // Fetch comp details + tournament_id in one query
  const compIds = (invRows as any[]).map((r: any) => r.comp_id)
  const { data: comps } = await (admin.from('comps') as any)
    .select('id, name, logo_url, invite_code, tournament_id')
    .in('id', compIds)

  const compMap: Record<string, any> = {}
  ;(comps ?? []).forEach((c: any) => { compMap[c.id] = c })

  // Fetch user's tournament enrollments to get blocked comp IDs
  const { data: enrollments } = await (admin.from('user_tournaments') as any)
    .select('tournament_id, blocked_comp_ids')
    .eq('user_id', user.id)

  const blockedSet = new Set<string>()
  ;(enrollments ?? []).forEach((e: any) => {
    ;(e.blocked_comp_ids ?? []).forEach((id: string) => blockedSet.add(id))
  })

  const data = (invRows as any[])
    .map((row: any) => {
      const comp = compMap[row.comp_id]
      if (!comp?.invite_code) return null
      if (blockedSet.has(comp.id)) return null
      return {
        invitation_id: row.id,
        comp_id:       comp.id,
        comp_name:     comp.name,
        comp_logo_url: comp.logo_url ?? null,
        invite_code:   comp.invite_code,
        tournament_id: comp.tournament_id ?? null,
        invited_at:    row.invited_at,
      }
    })
    .filter(Boolean)

  return NextResponse.json({ data })
}

// PATCH /api/comp-invitations/pending
// Declines an invitation. If block=true, also adds the comp to the user's
// blocked_comp_ids on their user_tournaments row for that tournament.
export async function PATCH(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { invitation_id, block } = body ?? {}
  if (!invitation_id) return NextResponse.json({ error: 'invitation_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Resolve user email for the safety filter
  const { data: userRow } = await admin
    .from('users').select('email').eq('id', user.id).single()
  const email = (userRow as any)?.email ?? user.email

  // Fetch the invitation to get comp_id before deleting
  const { data: inv } = await (admin.from('comp_invitations') as any)
    .select('id, comp_id')
    .eq('id', invitation_id)
    .ilike('email', email ?? '')
    .single()

  if (!inv) return NextResponse.json({ success: true }) // already gone

  // Delete the invitation row
  await (admin.from('comp_invitations') as any)
    .delete()
    .eq('id', invitation_id)

  // If the user wants to block all future invites from this comp,
  // append the comp_id to their blocked_comp_ids for this tournament.
  if (block && inv.comp_id) {
    const { data: comp } = await (admin.from('comps') as any)
      .select('tournament_id').eq('id', inv.comp_id).single()

    if (comp?.tournament_id) {
      // Read current blocked list then write back (Supabase JS doesn't support array_append directly)
      const { data: enrollment } = await (admin.from('user_tournaments') as any)
        .select('blocked_comp_ids')
        .eq('user_id', user.id)
        .eq('tournament_id', comp.tournament_id)
        .single()

      const current: string[] = enrollment?.blocked_comp_ids ?? []
      if (!current.includes(inv.comp_id)) {
        await (admin.from('user_tournaments') as any)
          .update({ blocked_comp_ids: [...current, inv.comp_id] })
          .eq('user_id', user.id)
          .eq('tournament_id', comp.tournament_id)
      }
    }
  }

  return NextResponse.json({ success: true })
}
