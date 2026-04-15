import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// GET /api/user-comps — list all comps the current user has joined
// Falls back to users.comp_id if user_comps table is empty for this user
export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Try user_comps join table first
  let { data: rows, error } = await supabase
    .from('user_comps')
    .select('comp_id, joined_at, comps(id, name, app_name, slug, logo_url, tournament_id, invite_code)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })

  // If user_comps is empty (migration not run or backfill missed), fall back to users.comp_id
  if (!error && (!rows || rows.length === 0)) {
    const { data: userRow } = await supabase
      .from('users').select('comp_id').eq('id', user.id).single()
    const compId = (userRow as any)?.comp_id ?? null
    const comp = compId
      ? (await supabase.from('comps')
          .select('id, name, app_name, slug, logo_url, tournament_id, invite_code')
          .eq('id', compId).single()).data
      : null

    if (comp) {
      // Backfill user_comps so next call uses the proper table
      await supabase.from('user_comps')
        .upsert({ user_id: user.id, comp_id: (userRow as any).comp_id }, { onConflict: 'user_id,comp_id' })
        .then(() => {}) // fire and forget

      return NextResponse.json({
        data: [{ comp_id: (userRow as any).comp_id, joined_at: null, comps: comp }]
      })
    }
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: rows ?? [] })
}

// POST /api/user-comps — join a comp
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id } = await request.json().catch(() => ({}))
  if (!comp_id) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const { data: comp } = await supabase.from('comps').select('id').eq('id', comp_id).single()
  if (!comp) return NextResponse.json({ error: 'Comp not found' }, { status: 404 })

  const { count } = await supabase
    .from('user_comps').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
  if ((count ?? 0) >= 3) return NextResponse.json({ error: 'You can join at most 3 comps' }, { status: 409 })

  const { error } = await supabase
    .from('user_comps').upsert({ user_id: user.id, comp_id }, { onConflict: 'user_id,comp_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
