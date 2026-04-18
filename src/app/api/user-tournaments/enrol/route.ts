import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

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

  // Upsert — idempotent, safe to call multiple times
  const { error } = await (admin.from('user_tournaments') as any)
    .upsert(
      { user_id, tournament_id, favourite_team: favourite_team || null },
      { onConflict: 'user_id,tournament_id', ignoreDuplicates: false }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
