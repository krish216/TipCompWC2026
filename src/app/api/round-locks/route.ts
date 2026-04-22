import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/round-locks?tournament_id=<id>
// Returns { data: { round_code: is_open, ... } } scoped to the tournament
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { searchParams } = new URL(request.url)
  const tournamentId = searchParams.get('tournament_id')

  let query = (supabase.from('round_locks') as any).select('round_code, is_open, opened_at')
  if (tournamentId) query = query.eq('tournament_id', tournamentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const locks: Record<string, boolean> = {}
  ;(data ?? []).forEach((r: any) => { locks[r.round_code] = r.is_open })
  return NextResponse.json({ data: locks })
}

// POST /api/round-locks — admin only, open or close a round for a tournament
// Body: { tournament_id, round, is_open }
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminClient = createAdminClient()
  const { data: adminRow } = await adminClient
    .from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!adminRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { tournament_id, round, is_open } = await request.json()
  if (!tournament_id) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })
  if (!round)         return NextResponse.json({ error: 'round required' },         { status: 400 })

  // Validate that this round_code exists in tournament_rounds for this tournament
  const { data: trRow } = await (adminClient.from('tournament_rounds') as any)
    .select('id').eq('tournament_id', tournament_id).eq('round_code', round).maybeSingle()
  if (!trRow) return NextResponse.json({ error: `Round '${round}' not found for this tournament` }, { status: 400 })

  const { error } = await (adminClient.from('round_locks') as any).upsert({
    tournament_id,
    round_code:  round,
    is_open,
    opened_at:   is_open ? new Date().toISOString() : null,
    opened_by:   is_open ? user.id : null,
  }, { onConflict: 'tournament_id,round_code' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, round, is_open })
}
