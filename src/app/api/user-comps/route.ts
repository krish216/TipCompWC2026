import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/user-comps?tournament_id=  — list comps the user has joined
// Uses admin client to bypass RLS entirely (avoids comp_admins recursion bug)
export async function GET(request: NextRequest) {
  const supabase      = createServerSupabaseClient()
  const adminClient   = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tournamentId = new URL(request.url).searchParams.get('tournament_id')

  // Query user_comps with admin client — no RLS interference
  let query = (adminClient.from('user_comps') as any)
    .select('comp_id, joined_at, comps(id, name, slug, logo_url, tournament_id, invite_code)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })

  const { data: rows, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let comps = (rows ?? []) as any[]

  // Filter by tournament if requested
  if (tournamentId) {
    comps = comps.filter((uc: any) => {
      const c = Array.isArray(uc.comps) ? uc.comps[0] : uc.comps
      return c?.tournament_id === tournamentId
    })
  }

  // Backfill: if user_comps empty, check users.comp_id and auto-populate
  if (comps.length === 0) {
    const { data: userRow } = await (adminClient.from('users') as any)
      .select('comp_id').eq('id', user.id).single()
    const compId = (userRow as any)?.comp_id ?? null
    if (compId) {
      const { data: compRow } = await (adminClient.from('comps') as any)
        .select('id, name, slug, logo_url, tournament_id, invite_code')
        .eq('id', compId).single()

      if (compRow && (!tournamentId || (compRow as any).tournament_id === tournamentId)) {
        // Backfill user_comps
        await (adminClient.from('user_comps') as any)
          .upsert({ user_id: user.id, comp_id: compId }, { onConflict: 'user_id,comp_id' })
        comps = [{ comp_id: compId, joined_at: null, comps: compRow }]
      }
    }
  }

  return NextResponse.json({ data: comps })
}

// POST /api/user-comps — join a comp
export async function POST(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { comp_id } = await request.json().catch(() => ({}))
  if (!comp_id) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const { data: comp } = await (adminClient.from('comps') as any)
    .select('id').eq('id', comp_id).single()
  if (!comp) return NextResponse.json({ error: 'Comp not found' }, { status: 404 })

  const { count } = await (adminClient.from('user_comps') as any)
    .select('*', { count: 'exact', head: true }).eq('user_id', user.id)
  if ((count ?? 0) >= 3)
    return NextResponse.json({ error: 'You can join at most 3 comps' }, { status: 409 })

  const { error } = await (adminClient.from('user_comps') as any)
    .upsert({ user_id: user.id, comp_id }, { onConflict: 'user_id,comp_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Keep users.comp_id in sync
  await (adminClient.from('users') as any).update({ comp_id }).eq('id', user.id)
  return NextResponse.json({ success: true })
}

// DELETE /api/user-comps?comp_id=X — leave a comp
export async function DELETE(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const comp_id = new URL(request.url).searchParams.get('comp_id')
  if (!comp_id) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

  const { error } = await (adminClient.from('user_comps') as any)
    .delete().match({ user_id: user.id, comp_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
