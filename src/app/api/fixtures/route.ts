import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// GET /api/fixtures — returns fixtures for the player's active tournament
// Falls back to the app-wide active tournament if user has no preference
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { searchParams } = new URL(request.url)
  const round        = searchParams.get('round')
  const group        = searchParams.get('group')
  const tournament_id = searchParams.get('tournament_id')

  // Resolve which tournament to show
  let activeTournamentId = tournament_id

  if (!activeTournamentId) {
    // Try to get from the logged-in user's preference
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: userRow } = await supabase
        .from('users')
        .select('active_tournament_id')
        .eq('id', user.id)
        .single()
      activeTournamentId = (userRow as any)?.active_tournament_id ?? null
    }
  }

  // Fall back to app-wide active tournament
  if (!activeTournamentId) {
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'active_tournament_id')
      .single()
    activeTournamentId = (setting as any)?.value ?? null
  }

  let query = supabase
    .from('fixtures')
    .select('id, round, grp, home, away, kickoff_utc, venue, home_score, away_score, pen_winner, result_outcome, tournament_id')
    .order('kickoff_utc')

  // Always filter by tournament
  if (activeTournamentId) query = query.eq('tournament_id', activeTournamentId)

  if (round) query = query.eq('round', round)
  if (group) query = query.eq('grp', group)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as any[]

  const fixtures = rows.map(f => ({
    id:            f.id,
    round:         f.round,
    group:         f.grp,
    home:          f.home,
    away:          f.away,
    kickoff_utc:   f.kickoff_utc,
    venue:         f.venue,
    tournament_id: f.tournament_id,
    result:        f.home_score != null
      ? { home: f.home_score, away: f.away_score, pen_winner: f.pen_winner ?? null, result_outcome: f.result_outcome ?? null }
      : null,
  }))

  return NextResponse.json({ data: fixtures, tournament_id: activeTournamentId })
}
