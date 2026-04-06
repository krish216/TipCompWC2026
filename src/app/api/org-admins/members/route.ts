import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/org-admins/members?org_id= — list all members in org
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

  const { data, error } = await adminClient
    .from('users').select('id, display_name, email, tribe_id').eq('org_id', orgId).order('display_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: (data ?? []) as any[] })
}
