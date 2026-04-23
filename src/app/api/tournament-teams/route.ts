import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/tournament-teams?tournament_id=<id>
// Public — no auth required. Returns team name, fifa_code, flag_emoji.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tournamentId = searchParams.get('tournament_id')
  if (!tournamentId) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

  const adminClient = createAdminClient()
  const { data, error } = await (adminClient.from('tournament_teams') as any)
    .select('name, fifa_code, flag_emoji')
    .eq('tournament_id', tournamentId)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ teams: data ?? [] })
}
