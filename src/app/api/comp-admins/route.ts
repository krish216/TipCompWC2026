import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/comp-admins?comp_id=  — check if current user is admin
// Without comp_id: returns all comps they admin
// With comp_id:    returns whether they admin that specific comp
// Uses service-role client to bypass RLS entirely
export async function GET(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ is_comp_admin: false, comps: [] })

  const compId = new URL(request.url).searchParams.get('comp_id')

  try {
    let query = (adminClient.from('comp_admins') as any)
      .select('comp_id').eq('user_id', user.id)
    if (compId) query = query.eq('comp_id', compId)

    const { data: rows, error } = await query
    if (error || !rows?.length) return NextResponse.json({ is_comp_admin: false, comps: [] })

    const compIds = rows.map((r: any) => r.comp_id)
    const { data: comps } = await (adminClient.from('comps') as any)
      .select('id, name, logo_url, invite_code, min_age, tournament_id').in('id', compIds)

    return NextResponse.json({ is_comp_admin: true, comps: comps ?? [] })
  } catch {
    return NextResponse.json({ is_comp_admin: false, comps: [] })
  }
}

// POST /api/comp-admins — grant comp admin (tournament admin only)
export async function POST(request: NextRequest) {
  const supabase   = createServerSupabaseClient()
  const adminClient = createAdminClient()

  const user = await getSessionUser()
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
