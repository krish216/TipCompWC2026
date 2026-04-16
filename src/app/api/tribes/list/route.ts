import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/tribes/list?comp_id= — list all tribes in an org (org admin only)
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const compId = searchParams.get('comp_id')
  if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  // Any authenticated member can list tribes in their org to join one
  // Use admin client so tribe_members count bypasses RLS
  const adminClient = createAdminClient()

  const { data, error } = await (adminClient.from('tribes') as any)
    .select('id, name, description, invite_code').eq('comp_id', compId).order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const tribes = (data ?? []) as any[]
  const tribeIds = tribes.map((t: any) => t.id)

  let allMembers: any[] = []
  if (tribeIds.length > 0) {
    const { data: memberRows } = await (adminClient.from('tribe_members') as any)
      .select('tribe_id, user_id').in('tribe_id', tribeIds)
    allMembers = memberRows ?? []
  }

  // Build member_count and member_ids per tribe
  const memberCounts: Record<string, number>    = {}
  const memberIds:    Record<string, string[]>  = {}
  allMembers.forEach((m: any) => {
    memberCounts[m.tribe_id] = (memberCounts[m.tribe_id] ?? 0) + 1
    if (!memberIds[m.tribe_id]) memberIds[m.tribe_id] = []
    memberIds[m.tribe_id].push(m.user_id)
  })

  const result = tribes.map((t: any) => ({
    ...t,
    member_count: memberCounts[t.id] ?? 0,
    member_ids:   memberIds[t.id]   ?? [],
  }))
  return NextResponse.json({ data: result })
}
