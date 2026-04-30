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
  if (tribeIds.length > 0) {
    const { data: tribeRows } = await (admin.from('tribes') as any)
      .select('id').eq('comp_id', comp_id).in('id', tribeIds)
    const ids = (tribeRows ?? []).map((t: any) => t.id)
    if (ids.length > 0) {
      await (admin.from('tribe_members') as any)
        .delete().eq('user_id', user.id).in('tribe_id', ids)
    }
  }

  // Remove from comp
  const { error } = await (admin.from('user_comps') as any)
    .delete().match({ comp_id, user_id: user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
