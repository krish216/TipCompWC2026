import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/comp-admins?comp_id=          — check if current user is admin for that comp
// GET /api/comp-admins                   — list all comps current user admins
// GET /api/comp-admins?comp_id=X&list=true — list all admins for that comp (comp admin only)
export async function GET(request: NextRequest) {
  const adminClient = createAdminClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ is_comp_admin: false, comps: [] })

  const { searchParams } = new URL(request.url)
  const compId   = searchParams.get('comp_id')
  const listMode = searchParams.get('list') === 'true'

  // List all admins for a specific comp (comp admin or global admin only)
  if (listMode && compId) {
    const [{ data: callerAdmin }, { data: globalAdmin }] = await Promise.all([
      (adminClient.from('comp_admins') as any).select('comp_id').eq('user_id', user.id).eq('comp_id', compId).maybeSingle(),
      adminClient.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle(),
    ])
    if (!callerAdmin && !globalAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: comp } = await (adminClient.from('comps') as any).select('created_by').eq('id', compId).single()
    const { data: adminRows } = await (adminClient.from('comp_admins') as any).select('user_id').eq('comp_id', compId)
    const adminUserIds = (adminRows ?? []).map((r: any) => r.user_id)

    const { data: userDetails } = await (adminClient.from('users') as any)
      .select('id, display_name, email').in('id', adminUserIds)

    return NextResponse.json({
      data: (userDetails ?? []).map((u: any) => ({
        user_id:      u.id,
        display_name: u.display_name,
        email:        u.email,
        is_owner:     u.id === (comp as any)?.created_by,
      })),
    })
  }

  // Standard: check/list comps the current user admins
  try {
    let query = (adminClient.from('comp_admins') as any).select('comp_id').eq('user_id', user.id)
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

// POST /api/comp-admins — grant comp admin (comp owner or global admin)
export async function POST(request: NextRequest) {
  const adminClient = createAdminClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, comp_id } = await request.json()
  if (!email || !comp_id) return NextResponse.json({ error: 'email and comp_id required' }, { status: 400 })

  // Allow comp owner OR global admin
  const [{ data: comp }, { data: globalAdmin }] = await Promise.all([
    (adminClient.from('comps') as any).select('created_by').eq('id', comp_id).single(),
    adminClient.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  const isCompOwner = (comp as any)?.created_by === user.id
  if (!isCompOwner && !globalAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Look up target user by email in users table
  const { data: targetUser } = await (adminClient.from('users') as any)
    .select('id, display_name').ilike('email', email).maybeSingle()
  if (!targetUser) return NextResponse.json({ error: 'User not found — they must be registered on TribePicks first' }, { status: 404 })

  const { error } = await (adminClient.from('comp_admins') as any)
    .upsert({ comp_id, user_id: (targetUser as any).id }, { onConflict: 'comp_id,user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, display_name: (targetUser as any).display_name })
}

// DELETE /api/comp-admins — revoke comp admin (comp owner or global admin only)
// Cannot remove the comp owner.
export async function DELETE(request: NextRequest) {
  const adminClient = createAdminClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id, user_id } = await request.json().catch(() => ({}))
  if (!comp_id || !user_id) return NextResponse.json({ error: 'comp_id and user_id required' }, { status: 400 })

  const [{ data: comp }, { data: globalAdmin }] = await Promise.all([
    (adminClient.from('comps') as any).select('created_by').eq('id', comp_id).single(),
    adminClient.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  const isCompOwner = (comp as any)?.created_by === user.id
  if (!isCompOwner && !globalAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if ((comp as any)?.created_by === user_id) return NextResponse.json({ error: 'Cannot remove the comp owner' }, { status: 400 })

  const { error } = await (adminClient.from('comp_admins') as any).delete().match({ comp_id, user_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
