import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { enrolInTournament } from '@/lib/enrol-tournament'

// POST /api/user-tournaments/enrol
// Called immediately after signUp() during registration — before email confirmation.
// Uses the admin/service-role client so no session is required.
// Body: { user_id, tournament_id, favourite_team? }
//
// The enrolment logic lives in @/lib/enrol-tournament so it can also be called
// AWAITED in-process by other signup paths (e.g. bracket guest entry) — never rely
// on a fire-and-forget fetch to this route, which serverless can drop.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const { user_id, tournament_id, favourite_team } = body ?? {}

  const admin = createAdminClient()
  const res = await enrolInTournament(admin, {
    userId: user_id, tournamentId: tournament_id, favouriteTeam: favourite_team,
  })

  if (!res.ok) {
    const status = res.error === 'user_id and tournament_id required' ? 400
      : res.error === 'Tournament not found' ? 404 : 500
    return NextResponse.json({ error: res.error }, { status })
  }
  return NextResponse.json({ success: true })
}
