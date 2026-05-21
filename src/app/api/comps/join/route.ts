import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

// POST /api/comps/join — join an open comp by comp_id, no invite code required.
// Checks: comp is open, user not blocked, member cap not exceeded.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id } = await request.json().catch(() => ({}))
  if (!comp_id) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const adminClient = createAdminClient()

  // 1. Verify comp exists and is open
  const { data: comp } = await (adminClient.from('comps') as any)
    .select('id, name, visibility, member_cap')
    .eq('id', comp_id)
    .eq('visibility', 'open')
    .maybeSingle()

  if (!comp) return NextResponse.json({ error: 'Comp not found or not open' }, { status: 404 })

  // 2. Check user is not blocked
  const { data: blocked } = await (adminClient.from('comp_blocked_users') as any)
    .select('id').eq('comp_id', comp_id).eq('user_id', user.id).maybeSingle()

  if (blocked) return NextResponse.json({ error: 'You are not permitted to join this comp' }, { status: 403 })

  // 3. Check already a member
  const { data: existing } = await (adminClient.from('user_comps') as any)
    .select('user_id').eq('comp_id', comp_id).eq('user_id', user.id).maybeSingle()

  if (existing) return NextResponse.json({ success: true, already_member: true, comp_name: comp.name })

  // 4. Check member cap
  if (comp.member_cap) {
    const { count } = await (adminClient.from('user_comps') as any)
      .select('*', { count: 'exact', head: true }).eq('comp_id', comp_id)
    if ((count ?? 0) >= comp.member_cap) {
      return NextResponse.json({ error: 'This comp is full' }, { status: 409 })
    }
  }

  // 5. Enrol
  await (adminClient.from('user_comps') as any).upsert(
    { user_id: user.id, comp_id },
    { onConflict: 'user_id,comp_id' }
  )

  // 6. Assign to default tribe (or sole tribe)
  const { data: compTribes } = await (adminClient.from('tribes') as any)
    .select('id, is_default').eq('comp_id', comp_id)
  const tribes = (compTribes ?? []) as { id: string; is_default: boolean }[]
  const targetTribe = tribes.find(t => t.is_default) ?? (tribes.length === 1 ? tribes[0] : null)

  if (targetTribe) {
    await (adminClient.from('tribe_members') as any).upsert(
      { user_id: user.id, tribe_id: targetTribe.id },
      { onConflict: 'user_id,tribe_id', ignoreDuplicates: true }
    )
  }

  return NextResponse.json({ success: true, comp_name: comp.name })
}
