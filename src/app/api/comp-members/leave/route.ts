import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// DELETE /api/comp-members/leave — authenticated tipster removes themselves from a comp.
// Comp admins (owners) are blocked — they must delete the comp instead.
// Also removes the user from any tribe they're in within this comp.
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id } = await request.json().catch(() => ({}))
  if (!comp_id) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Block comp admins — they must delete the comp, not leave it
  const { data: adminRow } = await (admin.from('comp_admins') as any)
    .select('user_id').eq('user_id', user.id).eq('comp_id', comp_id).single()
  if (adminRow) {
    return NextResponse.json(
      { error: 'Comp admins cannot leave — delete the comp instead' },
      { status: 403 }
    )
  }

  // Remove from any tribe within this comp first (FK safety)
  const { data: memberRows } = await (admin.from('tribe_members') as any)
    .select('tribe_id').eq('user_id', user.id)
  const tribeIds = (memberRows ?? []).map((r: any) => r.tribe_id).filter(Boolean)
  let ids: string[] = []
  if (tribeIds.length > 0) {
    const { data: tribeRows } = await (admin.from('tribes') as any)
      .select('id').eq('comp_id', comp_id).in('id', tribeIds)
    ids = (tribeRows ?? []).map((t: any) => t.id)
  }

  // Sweeps carry real money — once you've bought in, you can't walk away and take the record
  // with you. Blocked if the member holds ANY ticket in ANY pool of this sweep (spun or not,
  // bought or organiser-granted), or has a payment request pending/approved. Checked across
  // every pool under the comp, not just the ones they're a tribe_member of — tickets can sit
  // in a pool they were never listed in. The organiser removes them manually instead, same as
  // the "comp admins can't leave" rule above protects against losing the one person who can act.
  const { data: compTribes } = await (admin.from('tribes') as any).select('id').eq('comp_id', comp_id)
  const compTribeIds = ((compTribes ?? []) as any[]).map(t => t.id)
  if (compTribeIds.length > 0) {
    const [{ count: ticketCount }, { count: requestCount }] = await Promise.all([
      (admin.from('sweep_entries') as any).select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).in('tribe_id', compTribeIds),
      (admin.from('sweep_payment_requests') as any).select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).in('tribe_id', compTribeIds).in('status', ['pending', 'approved']),
    ])
    if ((ticketCount ?? 0) > 0 || (requestCount ?? 0) > 0) {
      return NextResponse.json({
        error: "You've bought into this sweep, so you can't leave it. If you need out, ask your organiser — they can sort out your tickets and money.",
      }, { status: 409 })
    }
  }

  if (ids.length > 0) {
    await (admin.from('tribe_members') as any)
      .delete().eq('user_id', user.id).in('tribe_id', ids)
  }

  // Remove from comp
  const { error } = await (admin.from('user_comps') as any)
    .delete().match({ comp_id, user_id: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
