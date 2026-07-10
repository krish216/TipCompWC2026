import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { isPlaceholder } from '@/lib/cascade-knockout'

// Per-user/tournament, so never shared-cached. Freshness is conditional: while any
// fixture still holds a placeholder team ("Quarterfinal 2 Winner"), the next round is
// mid-seeding, so serve no-store to catch each seed on load. Once every team is
// resolved the data is stable — allow a short private cache to save refetches.
export const dynamic = 'force-dynamic'

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
    const user = await getSessionUser()
    if (user) {
      const { data: prefs } = await supabase
        .from('user_preferences').select('tournament_id').eq('user_id', user.id).single()
      activeTournamentId = (prefs as any)?.tournament_id ?? null
    }
  }

  // Fall back to first active tournament, then app_settings
  if (!activeTournamentId) {
    const { data: active } = await supabase
      .from('tournaments').select('id').eq('is_active', true)
      .order('start_date', { ascending: true }).limit(1)
    activeTournamentId = (active as any)?.[0]?.id ?? null
  }
  if (!activeTournamentId) {
    const { data: setting } = await supabase
      .from('app_settings').select('value').eq('key', 'active_tournament_id').single()
    activeTournamentId = (setting as any)?.value ?? null
  }

  // Use admin client so tournament_rounds join works without RLS interference
  const adminClient = createAdminClient()
  
  // First, get the round to tab_group mapping
  const { data: roundData } = await adminClient
    .from('tournament_rounds')
    .select('round_code, tab_group')
    .eq('tournament_id', activeTournamentId || '')
  const roundToTab: Record<string, string> = {}
  if (roundData) {
    for (const r of roundData as any[]) {
      roundToTab[r.round_code] = r.tab_group
    }
  }

  let query = (adminClient.from('fixtures') as any)
    .select('id, round, grp, home, away, kickoff_utc, venue, bracket_slot, home_score, away_score, pen_winner, result_outcome, tournament_id')
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
    // tab_group from mapping, fallback to round
    tab_group:     roundToTab[f.round] || f.round,
    group:         f.grp,
    home:          f.home,
    away:          f.away,
    kickoff_utc:   f.kickoff_utc,
    venue:         f.venue,
    bracket_slot:  f.bracket_slot ?? null,
    tournament_id: f.tournament_id,
    result:        f.home_score != null
      ? { home: f.home_score, away: f.away_score, pen_winner: f.pen_winner ?? null, result_outcome: f.result_outcome ?? null }
      : null,
  }))

  // TBD present → still seeding, keep fresh; all teams resolved → brief private cache.
  const hasTBD = fixtures.some(f => isPlaceholder(f.home) || isPlaceholder(f.away))
  const cache = hasTBD ? 'no-store, must-revalidate' : 'private, max-age=60, must-revalidate'

  return NextResponse.json(
    { data: fixtures, tournament_id: activeTournamentId },
    { headers: { 'Cache-Control': cache } },
  )
}
