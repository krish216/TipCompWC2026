import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/comp-admins
// Returns whether the current user is a comp admin and which comps they admin
// Uses service-role client to bypass RLS entirely
export async function GET() {
  const supabase   = createServerSupabaseClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ is_comp_admin: false, comps: [] })

  try {
    const { data: rows, error } = await (adminClient.from('comp_admins') as any)
      .select('comp_id').eq('user_id', user.id)

    if (error || !rows?.length) return NextResponse.json({ is_comp_admin: false, comps: [] })

    const compIds = rows.map((r: any) => r.comp_id)
    const { data: comps } = await (adminClient.from('comps') as any)
      .select('id, name, app_name, logo_url, invite_code').in('id', compIds)

    return NextResponse.json({ is_comp_admin: true, comps: comps ?? [] })
  } catch {
    return NextResponse.json({ is_comp_admin: false, comps: [] })
  }
}

// POST /api/comp-admins — grant comp admin (tournament admin only)
export async function POST(request: NextRequest) {
  const supabase   = createServerSupabaseClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, comp_id } = await request.json()
  if (!email || !comp_id) return NextResponse.json({ error: 'email and comp_id required' }, { status: 400 })

  const { data: target } = await adminClient.auth.admin.listUsers()
  const targetUser = target?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())
  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { error } = await (adminClient.from('comp_admins') as any)
    .upsert({ comp_id, user_id: targetUser.id }, { onConflict: 'comp_id,user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
