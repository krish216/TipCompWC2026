import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/tribes/picks?tribe_id=
// Returns all locked fixtures with every tribe member's prediction
export async function GET(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const tribeId = url.searchParams.get('tribe_id')
  const tournamentIdParam = url.searchParams.get('tournament_id')
  if (!tribeId) return NextResponse.json({ error: 'tribe_id required' }, { status: 400 })

  // Verify user is a member of this tribe
  const { data: membership } = await supabase
    .from('tribe_members').select('user_id').eq('tribe_id', tribeId).eq('user_id', user.id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get tribe members
  const { data: memberRows } = await (adminClient.from('tribe_members') as any)
    .select('user_id, users(id, display_name, avatar_url)')
    .eq('tribe_id', tribeId)
  const members = (memberRows ?? []).map((m: any) => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users
    return { user_id: m.user_id, display_name: u?.display_name ?? 'Unknown', avatar_url: u?.avatar_url ?? null }
  })

  const memberIds = members.map((m: any) => m.user_id)

  // Get locked fixtures (kickoff <= now + 5min OR has result)
  // Use explicit param or derive from tribe's tournament_id column
  let tournamentId: string | null = tournamentIdParam
  if (!tournamentId) {
    const { data: tribeRow } = await (adminClient.from('tribes') as any)
      .select('tournament_id').eq('id', tribeId).single()
    tournamentId = (tribeRow as any)?.tournament_id ?? null
  }

  const cutoff = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  let fixturesQ = (adminClient.from('fixtures') as any)
    .select('id, round, home, away, kickoff_utc, venue, home_score, away_score, pen_winner')
    .or(`kickoff_utc.lte.${cutoff},home_score.not.is.null`)
    .order('kickoff_utc', { ascending: true })
  if (tournamentId) fixturesQ = fixturesQ.eq('tournament_id', tournamentId)
  const { data: fixtureRows } = await fixturesQ

  const fixtures = (fixtureRows ?? []).map((f: any) => ({
    id:          f.id,
    round:       f.round,
    home:        f.home,
    away:        f.away,
    kickoff_utc: f.kickoff_utc,
    venue:       f.venue,
    pen_winner:  f.pen_winner ?? null,
    result:      f.home_score != null ? { home: f.home_score, away: f.away_score } : null,
  }))

  if (fixtures.length === 0) return NextResponse.json({ fixtures: [], members, picks: {} })

  const fixtureIds = fixtures.map((f: any) => f.id)

  // Get all predictions for these fixtures from tribe members
  let predQ = (adminClient.from('predictions') as any)
    .select('user_id, fixture_id, home, away, outcome, pen_winner, points_earned, standard_points, bonus_points')
    .in('fixture_id', fixtureIds)
    .in('user_id', memberIds)
  if (tournamentId) predQ = predQ.eq('tournament_id', tournamentId)
  const { data: predRows } = await predQ

  // Build picks map: { fixture_id: { user_id: { home, away, pen_winner, points_earned } } }
  const picks: Record<number, Record<string, any>> = {}
  ;(predRows ?? []).forEach((p: any) => {
    if (!picks[p.fixture_id]) picks[p.fixture_id] = {}
    picks[p.fixture_id][p.user_id] = {
      home:            p.home,
      away:            p.away,
      outcome:         p.outcome ?? null,
      pen_winner:      p.pen_winner,
      points_earned:   p.points_earned,
      standard_points: p.standard_points,
      bonus_points:    p.bonus_points,
    }
  })

  return NextResponse.json({ fixtures, members, picks })
}
