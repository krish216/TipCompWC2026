import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const TABLE = 'four_pick_challenge_completions'

async function findRow(
  admin: ReturnType<typeof createAdminClient>,
  userId: string | null,
  sessionId: string,
  tournamentId: string,
): Promise<{ id: string } | null> {
  if (userId) {
    const { data } = await (admin.from(TABLE) as any)
      .select('id')
      .eq('user_id', userId)
      .eq('tournament_id', tournamentId)
      .maybeSingle()
    if (data) return data
  }
  const { data } = await (admin.from(TABLE) as any)
    .select('id')
    .eq('session_id', sessionId)
    .eq('tournament_id', tournamentId)
    .maybeSingle()
  return data ?? null
}

// POST /api/challenge-completion
// Body: { tournament_id, session_id, source?, device?, completed_at?, signed_up_at? }
// Upserts the completion row for the session / user.
// Called twice: once on 4th pick (completed_at), once on sign-up conversion (signed_up_at).
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser()
    const body = await request.json().catch(() => null)
    const { tournament_id, session_id, source, device, completed_at, signed_up_at } = body ?? {}

    if (!tournament_id || !session_id) {
      return NextResponse.json({ error: 'tournament_id and session_id required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const now   = new Date().toISOString()

    const patch: Record<string, unknown> = { updated_at: now }
    if (source       !== undefined) patch.source       = source
    if (device       !== undefined) patch.device       = device
    if (completed_at !== undefined) patch.completed_at = completed_at
    if (signed_up_at !== undefined) patch.signed_up_at = signed_up_at

    if (user) {
      const existing = await findRow(admin, user.id, session_id, tournament_id)
      if (existing) {
        await (admin.from(TABLE) as any).update({ ...patch, user_id: user.id }).eq('id', existing.id)
      } else {
        await (admin.from(TABLE) as any).insert({ ...patch, user_id: user.id, session_id, tournament_id })
      }
    } else {
      const existing = await findRow(admin, null, session_id, tournament_id)
      if (existing) {
        await (admin.from(TABLE) as any).update(patch).eq('id', existing.id)
      } else {
        await (admin.from(TABLE) as any).insert({ ...patch, session_id, tournament_id })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}
