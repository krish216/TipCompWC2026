import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

async function verifyCompAdminForTribe(userId: string, tribeId: string) {
  const admin = createAdminClient()
  const { data: tribe } = await (admin.from('tribes') as any).select('id, comp_id').eq('id', tribeId).single()
  if (!tribe) return null
  const { data: adminRow } = await (admin.from('comp_admins') as any)
    .select('comp_id').eq('user_id', userId).eq('comp_id', (tribe as any).comp_id).maybeSingle()
  const { data: globalAdmin } = await admin.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle()
  if (!adminRow && !globalAdmin) return null
  return tribe as any
}

// POST /api/tribes/members — comp admin assigns a tipster to a tribe
// Moves them out of any other tribe in the same comp first.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tribe_id, user_id } = await request.json().catch(() => ({}))
  if (!tribe_id || !user_id) return NextResponse.json({ error: 'tribe_id and user_id required' }, { status: 400 })

  const admin = createAdminClient()
  const tribe = await verifyCompAdminForTribe(user.id, tribe_id)
  if (!tribe) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Verify target is a comp member
  const { data: membership } = await (admin.from('user_comps') as any)
    .select('comp_id').eq('user_id', user_id).eq('comp_id', tribe.comp_id).maybeSingle()
  if (!membership) return NextResponse.json({ error: 'User is not a member of this comp' }, { status: 400 })

  // Remove from any existing tribe in this comp first
  const { data: existingRows } = await (admin.from('tribe_members') as any).select('tribe_id').eq('user_id', user_id)
  const existingTribeIds = (existingRows ?? []).map((r: any) => r.tribe_id)
  if (existingTribeIds.length > 0) {
    const { data: compTribes } = await (admin.from('tribes') as any)
      .select('id').eq('comp_id', tribe.comp_id).in('id', existingTribeIds)
    for (const ct of (compTribes ?? [])) {
      await (admin.from('tribe_members') as any).delete().match({ user_id, tribe_id: ct.id })
    }
  }

  const { error } = await (admin.from('tribe_members') as any).insert({ user_id, tribe_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/tribes/members?tribe_id=X&user_id=Y — comp admin removes a tipster from a tribe
export async function DELETE(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const tribe_id = searchParams.get('tribe_id')
  const user_id  = searchParams.get('user_id')
  if (!tribe_id || !user_id) return NextResponse.json({ error: 'tribe_id and user_id required' }, { status: 400 })

  const admin = createAdminClient()
  const tribe = await verifyCompAdminForTribe(user.id, tribe_id)
  if (!tribe) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await (admin.from('tribe_members') as any).delete().match({ user_id, tribe_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
