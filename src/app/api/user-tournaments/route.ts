import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { isBonusTeamLocked } from '@/lib/tournament-lock'

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
