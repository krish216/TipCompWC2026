import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/tribes/list?org_id= — list all tribes in an org (org admin only)
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const orgId = searchParams.get('org_id')
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  const adminClient = createAdminClient()
  const { data: orgAdmin } = await (adminClient.from('org_admins') as any)
    .select('org_id').eq('user_id', user.id).eq('org_id', orgId).single()
  const { data: tournamentAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!orgAdmin && !tournamentAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('tribes').select('id, name, description, invite_code').eq('org_id', orgId).order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add member count for each tribe
  const tribes = (data ?? []) as any[]
  const tribeIds = tribes.map((t: any) => t.id)
  let memberCounts: Record<string, number> = {}
  if (tribeIds.length > 0) {
    const { data: members } = await supabase
      .from('tribe_members').select('tribe_id').in('tribe_id', tribeIds)
    ;(members ?? []).forEach((m: any) => {
      memberCounts[m.tribe_id] = (memberCounts[m.tribe_id] ?? 0) + 1
    })
  }

  const result = tribes.map((t: any) => ({ ...t, member_count: memberCounts[t.id] ?? 0 }))
  return NextResponse.json({ data: result })
}
