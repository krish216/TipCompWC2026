import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

async function verifyCompAdmin(admin: any, userId: string, compId: string) {
  const [{ data: ca }, { data: ta }] = await Promise.all([
    (admin.from('comp_admins') as any).select('comp_id').eq('user_id', userId).eq('comp_id', compId).single(),
    admin.from('admin_users').select('user_id').eq('user_id', userId).single(),
  ])
  return !!(ca || ta)
}

// GET /api/comp-members?comp_id=
// Returns all tipsters in a comp with their fee_paid status
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const compId = new URL(request.url).searchParams.get('comp_id')
  if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const admin = createAdminClient()
  if (!(await verifyCompAdmin(admin, user.id, compId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await (admin.from('user_comps') as any)
    .select('user_id, joined_at, fee_paid, fee_paid_amount, fee_paid_at, fee_notes, users(id, display_name, email)')
    .eq('comp_id', compId)
    .order('joined_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: (data ?? []).map((row: any) => ({
      user_id:         row.users?.id ?? row.user_id,
      display_name:    row.users?.display_name ?? 'Unknown',
      email:           row.users?.email ?? '',
      joined_at:       row.joined_at,
      fee_paid:        row.fee_paid        ?? false,
      fee_paid_amount: row.fee_paid_amount ?? null,
      fee_paid_at:     row.fee_paid_at     ?? null,
      fee_notes:       row.fee_notes       ?? null,
    }))
  })
}

// PATCH /api/comp-members — update fee_paid status for a single tipster
// Body: { comp_id, user_id, fee_paid, fee_paid_amount?, fee_notes? }
export async function PATCH(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { comp_id, user_id, fee_paid, fee_paid_amount, fee_notes } = body ?? {}
  if (!comp_id || !user_id) return NextResponse.json({ error: 'comp_id and user_id required' }, { status: 400 })

  const admin = createAdminClient()
  if (!(await verifyCompAdmin(admin, user.id, comp_id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const update: Record<string, any> = {}
  if (fee_paid          !== undefined) update.fee_paid        = fee_paid
  if (fee_paid_amount   !== undefined) update.fee_paid_amount = fee_paid_amount ?? null
  if (fee_notes         !== undefined) update.fee_notes       = fee_notes ?? null
  // Auto-stamp paid_at
  if (fee_paid === true)               update.fee_paid_at     = new Date().toISOString()
  if (fee_paid === false)              update.fee_paid_at     = null

  const { data, error } = await (admin.from('user_comps') as any)
    .update(update)
    .match({ comp_id, user_id })
    .select('user_id, fee_paid, fee_paid_amount, fee_paid_at, fee_notes')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/comp-members?comp_id=X&user_id=Y — remove a tipster from a comp
export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const compId = searchParams.get('comp_id')
  const userId = searchParams.get('user_id')
  if (!compId || !userId) return NextResponse.json({ error: 'comp_id and user_id required' }, { status: 400 })

  const admin = createAdminClient()
  if (!(await verifyCompAdmin(admin, user.id, compId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (userId === user.id)
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })

  const { error } = await (admin.from('user_comps') as any)
    .delete().match({ comp_id: compId, user_id: userId })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
