import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/round-locks?tournament_id=<id>
// Returns { data: { round_code: is_open, ... } } scoped to the tournament
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { searchParams } = new URL(request.url)
  const tournamentId = searchParams.get('tournament_id')

  let query = (supabase.from('round_locks') as any).select('round_code, is_open, opened_at, tipping_closed')
  if (tournamentId) query = query.eq('tournament_id', tournamentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const locks: Record<string, boolean> = {}
  const tippingClosed: Record<string, boolean> = {}
  ;(data ?? []).forEach((r: any) => {
    locks[r.round_code]         = r.is_open
    tippingClosed[r.round_code] = r.tipping_closed ?? false
  })
  return NextResponse.json({ data: locks, tipping_closed: tippingClosed })
}

// POST /api/round-locks — global admin or comp admin for the tournament
// Body: { tournament_id, round, is_open }
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const body = await request.json()
  const { tournament_id, round, is_open, tipping_closed } = body

  if (!tournament_id) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })
  if (!round)         return NextResponse.json({ error: 'round required' },         { status: 400 })

  // Allow global admin OR comp admin for a comp that belongs to this tournament
  const [{ data: globalAdmin }, { data: compAdminRow }] = await Promise.all([
    adminClient.from('admin_users').select('user_id').eq('user_id', user.id).single(),
    (adminClient.from('comp_admins') as any)
      .select('user_id')
      .eq('user_id', user.id)
      .in('comp_id',
        (adminClient.from('comps') as any).select('id').eq('tournament_id', tournament_id)
      )
      .limit(1).maybeSingle(),
  ])
  if (!globalAdmin && !compAdminRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Validate that this round_code exists in tournament_rounds for this tournament
  const { data: trRow } = await (adminClient.from('tournament_rounds') as any)
    .select('id').eq('tournament_id', tournament_id).eq('round_code', round).maybeSingle()
  if (!trRow) return NextResponse.json({ error: `Round '${round}' not found for this tournament` }, { status: 400 })

  const patch: Record<string, any> = {
    tournament_id,
    round_code: round,
  }
  if (is_open !== undefined) {
    patch.is_open    = is_open
    patch.opened_at  = is_open ? new Date().toISOString() : null
    patch.opened_by  = is_open ? user.id : null
  }
  if (tipping_closed !== undefined) {
    patch.tipping_closed = tipping_closed
  }

  const { error } = await (adminClient.from('round_locks') as any).upsert(
    patch, { onConflict: 'tournament_id,round_code' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, round, is_open, tipping_closed })
}
