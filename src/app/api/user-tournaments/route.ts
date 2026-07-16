import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { isBonusTeamLocked, isExactFocusClubCommitted } from '@/lib/tournament-lock'

// GET /api/user-tournaments — list tournaments the current user is enrolled in
export async function GET() {
  const supabase = createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_tournaments')
    .select('tournament_id, favourite_team, enrolled_at, tournaments(id, name, slug, status, start_date, end_date)')
    .eq('user_id', user.id)
    .order('enrolled_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/user-tournaments — enrol in a tournament (or update fav team)
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { tournament_id, favourite_team, selected_comp_id } = body
  if (!tournament_id) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

  // Verify the tournament exists and is not completed
  const { data: tourn } = await supabase
    .from('tournaments').select('id, status').eq('id', tournament_id).single()
  if (!tourn) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

  // Bonus team is frozen once the first real match kicks off. Reject an attempted
  // change after the lock (enrolment itself still succeeds without touching the team).
  const locked = await isBonusTeamLocked(supabase, tournament_id)
  if (locked && favourite_team) {
    return NextResponse.json({ error: 'Bonus team is locked — the tournament has started.' }, { status: 409 })
  }

  // EPL exact-focus club lock: once the club's exact score is entered for the current open
  // round, freeze it for that round — the scoring trigger reads the club live per fixture, so
  // a mutable club could otherwise harvest the weekly bonus. A change is only refused when the
  // CURRENT club is already committed; the first pick stays free, and PRACTICE mode
  // (allow_retroactive_predictions) overrides the lock so warm-up/testing picks stay
  // changeable. (WC uses the kickoff lock above and isn't affected.)
  if (!locked && 'favourite_team' in body) {
    const { data: tconf } = await supabase
      .from('tournaments').select('fav_exact_focus, allow_retroactive_predictions').eq('id', tournament_id).maybeSingle()
    if ((tconf as any)?.fav_exact_focus && !(tconf as any)?.allow_retroactive_predictions) {
      const { data: utCur } = await supabase
        .from('user_tournaments').select('favourite_team')
        .eq('user_id', user.id).eq('tournament_id', tournament_id).maybeSingle()
      const currentFav = (utCur as any)?.favourite_team ?? null
      const changing   = (favourite_team || null) !== currentFav
      if (changing && await isExactFocusClubCommitted(supabase, tournament_id, user.id, currentFav)) {
        return NextResponse.json(
          { error: "Your club is locked for this round — you've entered its score. You can change it next round." },
          { status: 409 },
        )
      }
    }
  }

  // Only write the fields actually supplied, so a comp-only update never clobbers the
  // bonus team (and vice versa). onConflict upsert leaves omitted columns untouched.
  const row: any = { user_id: user.id, tournament_id }
  if (!locked && 'favourite_team' in body) row.favourite_team = favourite_team || null
  if ('selected_comp_id' in body)          row.selected_comp_id = selected_comp_id ?? null

  const { error } = await (supabase.from('user_tournaments') as any)
    .upsert(row, { onConflict: 'user_id,tournament_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// DELETE /api/user-tournaments?tournament_id=X — leave a tournament
export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tournament_id = new URL(request.url).searchParams.get('tournament_id')
  if (!tournament_id) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

  const { error } = await (supabase.from('user_tournaments') as any)
    .delete()
    .match({ user_id: user.id, tournament_id })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
