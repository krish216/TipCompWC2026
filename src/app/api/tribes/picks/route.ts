import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/tribes/picks?tribe_id=  — tribe scope
// GET /api/tribes/picks?comp_id=   — whole-comp scope (closed rounds only)
export async function GET(request: NextRequest) {
  const supabase    = createServerSupabaseClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url              = new URL(request.url)
  const tribeId          = url.searchParams.get('tribe_id')
  const compId           = url.searchParams.get('comp_id')
  const tournamentIdParam = url.searchParams.get('tournament_id')

  if (!tribeId && !compId) return NextResponse.json({ error: 'tribe_id or comp_id required' }, { status: 400 })

  // ── Resolve members ────────────────────────────────────────────────────────
  let members: { user_id: string; display_name: string; avatar_url: string | null }[] = []
  let tournamentId: string | null = tournamentIdParam

  if (tribeId) {
    // Verify user is a member of this tribe
    const { data: membership } = await supabase
      .from('tribe_members').select('user_id').eq('tribe_id', tribeId).eq('user_id', user.id).single()
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: memberRows } = await (adminClient.from('tribe_members') as any)
      .select('user_id, users(id, display_name, avatar_url)')
      .eq('tribe_id', tribeId)
    members = (memberRows ?? []).map((m: any) => {
      const u = Array.isArray(m.users) ? m.users[0] : m.users
      return { user_id: m.user_id, display_name: u?.display_name ?? 'Unknown', avatar_url: u?.avatar_url ?? null }
    })

    if (!tournamentId) {
      const { data: tribeRow } = await (adminClient.from('tribes') as any)
        .select('tournament_id').eq('id', tribeId).single()
      tournamentId = (tribeRow as any)?.tournament_id ?? null
    }
  } else if (compId) {
    // Verify user belongs to this comp
    const { data: compMembership } = await (adminClient.from('user_comps') as any)
      .select('comp_id').eq('user_id', user.id).eq('comp_id', compId).maybeSingle()
    if (!compMembership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: memberRows } = await (adminClient.from('user_comps') as any)
      .select('user_id, users(id, display_name, avatar_url)')
      .eq('comp_id', compId)
    members = (memberRows ?? []).map((m: any) => {
      const u = Array.isArray(m.users) ? m.users[0] : m.users
      return { user_id: m.user_id, display_name: u?.display_name ?? 'Unknown', avatar_url: u?.avatar_url ?? null }
    })

    if (!tournamentId) {
      const { data: compRow } = await (adminClient.from('comps') as any)
        .select('tournament_id').eq('id', compId).maybeSingle()
      tournamentId = (compRow as any)?.tournament_id ?? null
    }
  }

  const memberIds = members.map((m) => m.user_id)

  // ── Fetch tipping_closed flags ─────────────────────────────────────────────
  const tippingClosedMap: Record<string, boolean> = {}
  if (tournamentId) {
    const { data: lockRows } = await (adminClient.from('round_locks') as any)
      .select('round_code, tipping_closed').eq('tournament_id', tournamentId)
    ;(lockRows ?? []).forEach((r: any) => { tippingClosedMap[r.round_code] = r.tipping_closed ?? false })
  }

  // ── Fixtures ───────────────────────────────────────────────────────────────
  const closedRounds = new Set(
    Object.entries(tippingClosedMap).filter(([, v]) => v).map(([k]) => k)
  )

  // Closed rounds: return ALL fixtures (picks are visible regardless of kickoff).
  // Non-closed rounds: only return fixtures that have already kicked off so picks
  // stay private until the deadline.
  const cutoff = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  const closedRoundsArr = [...closedRounds]
  let fixturesQ = (adminClient.from('fixtures') as any)
    .select('id, round, home, away, kickoff_utc, venue, home_score, away_score, pen_winner')
    .order('kickoff_utc', { ascending: true })
  if (tournamentId) fixturesQ = fixturesQ.eq('tournament_id', tournamentId)
  if (closedRoundsArr.length > 0) {
    fixturesQ = fixturesQ.or(
      `round.in.(${closedRoundsArr.join(',')}),kickoff_utc.lte.${cutoff},home_score.not.is.null`
    )
  } else {
    fixturesQ = fixturesQ.or(`kickoff_utc.lte.${cutoff},home_score.not.is.null`)
  }
  const { data: fixtureRows } = await fixturesQ

  const fixtures = (fixtureRows ?? [])
    .filter((f: any) => !compId || closedRounds.has(f.round)) // comp scope: closed rounds only
    .map((f: any) => ({
      id:          f.id,
      round:       f.round,
      home:        f.home,
      away:        f.away,
      kickoff_utc: f.kickoff_utc,
      venue:       f.venue,
      pen_winner:  f.pen_winner ?? null,
      result:      f.home_score != null ? { home: f.home_score, away: f.away_score } : null,
    }))

  if (fixtures.length === 0 || memberIds.length === 0) {
    return NextResponse.json({ fixtures: [], members, picks: {}, tipping_closed: tippingClosedMap })
  }

  const fixtureIds = fixtures.map((f: any) => f.id)

  // ── Predictions ────────────────────────────────────────────────────────────
  let predQ = (adminClient.from('predictions') as any)
    .select('user_id, fixture_id, home, away, outcome, pen_winner, points_earned, standard_points, bonus_points')
    .in('fixture_id', fixtureIds)
    .in('user_id', memberIds)
  if (tournamentId) predQ = predQ.eq('tournament_id', tournamentId)
  const { data: predRows } = await predQ

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

  return NextResponse.json({ fixtures, members, picks, tipping_closed: tippingClosedMap })
}
