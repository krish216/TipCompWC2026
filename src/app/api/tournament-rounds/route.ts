export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import type { RoundConfig } from '@/types'

// GET /api/tournament-rounds?tournament_id=xxx
// Returns all round configs for a tournament, ordered by round_order.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tournamentId = searchParams.get('tournament_id')
  if (!tournamentId) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
  const fields = 'id,tournament_id,round_code,round_name,round_order,tab_group,tab_label,is_knockout,predict_mode,result_pts,exact_bonus,pen_bonus,fav_team_2x'
  const url = supabaseUrl + '/rest/v1/tournament_rounds?tournament_id=eq.' + tournamentId + '&order=round_order&select=' + fields
  const res = await fetch(url, {
    headers: { 'apikey': serviceKey ?? '', 'Authorization': 'Bearer ' + (serviceKey ?? '') },
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  const data = await res.json()
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } })
}

// PUT /api/tournament-rounds — tournament admin upserts a round config
export async function PUT(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify tournament admin
  const body = await request.json()
  const { tournament_id, round_code, round_name, round_order, tab_group, is_knockout,
          predict_mode, result_pts, exact_bonus, pen_bonus, fav_team_2x } = body

  if (!tournament_id || !round_code) {
    return NextResponse.json({ error: 'tournament_id and round_code required' }, { status: 400 })
  }

  const { data: isAdmin } = await supabase
    .from('tournament_admins').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Tournament admin only' }, { status: 403 })

  const adminClient = createAdminClient()
  const { data, error } = await (adminClient.from('tournament_rounds') as any)
    .upsert({
      tournament_id, round_code, round_name, round_order,
      tab_group:    tab_group   ?? round_code,
      is_knockout:  is_knockout  ?? false,
      predict_mode: predict_mode ?? 'outcome',
      result_pts:   result_pts  ?? 0,
      exact_bonus:  exact_bonus ?? 0,
      pen_bonus:    pen_bonus   ?? 0,
      fav_team_2x:  fav_team_2x ?? false,
    }, { onConflict: 'tournament_id,round_code' })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
