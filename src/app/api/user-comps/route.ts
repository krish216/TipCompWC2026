import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/user-comps — list all comps the current user has joined
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_comps')
    .select('comp_id, joined_at, comps(id, name, app_name, slug, logo_url, tournament_id, invite_code)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/user-comps — join a comp
export async function POST(request: NextRequest) {
  const supabase   = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id } = await request.json().catch(() => ({}))
  if (!comp_id) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  // Verify comp exists
  const { data: comp } = await supabase.from('comps').select('id').eq('id', comp_id).single()
  if (!comp) return NextResponse.json({ error: 'Comp not found' }, { status: 404 })

  // Check 3-comp limit
  const { count } = await supabase.from('user_comps').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
  if ((count ?? 0) >= 3) return NextResponse.json({ error: 'You can join at most 3 comps' }, { status: 409 })

  const { error } = await supabase.from('user_comps').upsert({ user_id: user.id, comp_id }, { onConflict: 'user_id,comp_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also update users.comp_id to this comp (primary comp)
  await supabase.from('users').update({ comp_id }).eq('id', user.id)

  return NextResponse.json({ success: true })
}

// DELETE /api/user-comps?comp_id=X — leave a comp
export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const comp_id = new URL(request.url).searchParams.get('comp_id')
  if (!comp_id) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const { error } = await supabase.from('user_comps').delete().match({ user_id: user.id, comp_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
