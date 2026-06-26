import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { sendWelcomeIfNeeded } from '@/lib/welcome-email'
import { isBonusTeamLocked } from '@/lib/tournament-lock'
import { pickAliveTeam } from '@/lib/bonus-team'

// POST /api/user-tournaments/enrol
// Called immediately after signUp() during registration — before email confirmation.
// Uses the admin/service-role client so no session is required.
// Body: { user_id, tournament_id, favourite_team? }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const { user_id, tournament_id, favourite_team } = body ?? {}

  if (!user_id || !tournament_id) {
    return NextResponse.json({ error: 'user_id and tournament_id required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify the tournament exists
  const { data: tourn } = await admin
    .from('tournaments').select('id').eq('id', tournament_id).maybeSingle()
  if (!tourn) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

  // Bonus team is frozen once the first real match kicks off. Enrolment still
  // succeeds after that — we just don't apply a (now-disallowed) favourite team.
  const locked = await isBonusTeamLocked(admin, tournament_id)
  const row: any = { user_id, tournament_id }
  if (!locked) {
    row.favourite_team = favourite_team || null
  } else {
    // Tournament under way: the picker is locked, so a player joining for the
    // knockout run can't choose a bonus team. Auto-allocate one from the still-alive
    // R32 advancers so they still get the Round-of-32 2x — unless they already have a
    // pick (e.g. re-enrol of someone who chose before lock), which we never clobber.
    const { data: existing } = await admin
      .from('user_tournaments').select('favourite_team')
      .eq('user_id', user_id).eq('tournament_id', tournament_id).maybeSingle()
    if (!(existing as any)?.favourite_team) {
      const auto = await pickAliveTeam(admin, tournament_id)
      if (auto) { row.favourite_team = auto; row.favourite_team_auto = true }
    }
  }

  // Upsert — idempotent, safe to call multiple times
  const { error } = await (admin.from('user_tournaments') as any)
    .upsert(row, { onConflict: 'user_id,tournament_id', ignoreDuplicates: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send welcome email — tournament_id is known here so template lookup is exact
  await sendWelcomeIfNeeded(user_id, tournament_id)

  return NextResponse.json({ success: true })
}
