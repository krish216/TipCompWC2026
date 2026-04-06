import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/org-admins — check if current user is org admin
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ is_org_admin: false })

  const adminClient = createAdminClient()
  const { data } = await (adminClient.from('org_admins') as any)
    .select('org_id, organisations(id, name, slug, invite_code)')
    .eq('user_id', user.id)
    .single()

  if (!data) return NextResponse.json({ is_org_admin: false })
  return NextResponse.json({
    is_org_admin: true,
    org_id: (data as any).org_id,
    org:    (data as any).organisations,
  })
}

// POST /api/org-admins — grant org admin (tournament admin or existing org admin)
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, org_id } = await request.json()
  if (!email || !org_id) return NextResponse.json({ error: 'email and org_id required' }, { status: 400 })

  // Verify caller is tournament admin OR org admin of this org
  const { data: isTournamentAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  const { data: isOrgAdmin } = await (adminClient.from('org_admins') as any)
    .select('user_id').eq('user_id', user.id).eq('org_id', org_id).single()
  if (!isTournamentAdmin && !isOrgAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: target } = await adminClient
    .from('users').select('id').eq('email', email).single()
  if (!target) return NextResponse.json({ error: 'User not found — they must register first' }, { status: 404 })

  // Assign user to this org and grant org admin
  await (adminClient.from('users') as any)
    .update({ org_id }).eq('id', (target as any).id)
  await (adminClient.from('org_admins') as any)
    .upsert({ org_id, user_id: (target as any).id })

  return NextResponse.json({ success: true })
}
