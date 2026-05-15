import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Finds the prediction row for the current user or session.
// Returns the row id, or null if none exists.
async function findRow(
  admin: ReturnType<typeof createAdminClient>,
  userId: string | null,
  sessionId: string,
  tournamentId: string,
): Promise<{ id: string; share_count: number; source: string | null } | null> {
  if (userId) {
    const { data } = await (admin.from('bracket_predictions') as any)
      .select('id, share_count, source')
      .eq('user_id', userId)
      .eq('tournament_id', tournamentId)
      .maybeSingle()
    if (data) return data
  }
  const { data } = await (admin.from('bracket_predictions') as any)
    .select('id, share_count, source')
    .eq('session_id', sessionId)
    .eq('tournament_id', tournamentId)
    .maybeSingle()
  return data ?? null
}

// POST /api/bracket-prediction
// Body: { tournament_id, session_id, champion?, runner_up?,
//         sf_loser_1?, sf_loser_2?, source?, device?, completed_at? }
// Upserts the prediction row for the current session / user.
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser()
    const body = await request.json().catch(() => null)
    const {
      tournament_id, session_id,
      champion, runner_up,
      sf_loser_1, sf_loser_2,
      source, device, completed_at,
    } = body ?? {}

    if (!tournament_id || !session_id) {
      return NextResponse.json({ error: 'tournament_id and session_id required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const now   = new Date().toISOString()

    // Build the patch — only include fields that were explicitly provided
    const patch: Record<string, unknown> = { updated_at: now }
    if (champion     !== undefined) patch.champion   = champion
    if (runner_up    !== undefined) patch.runner_up  = runner_up
    if (sf_loser_1   !== undefined) patch.sf_loser_1 = sf_loser_1
    if (sf_loser_2   !== undefined) patch.sf_loser_2 = sf_loser_2
    if (device       !== undefined) patch.device     = device
    if (completed_at !== undefined) patch.completed_at = completed_at

    if (user) {
      const existing = await findRow(admin, user.id, session_id, tournament_id)

      if (existing) {
        // Only set source if the row doesn't already have one (first-touch attribution)
        if (source && !existing.source) patch.source = source
        await (admin.from('bracket_predictions') as any)
          .update(patch)
          .eq('id', existing.id)
      } else {
        if (source) patch.source = source
        await (admin.from('bracket_predictions') as any)
          .insert({ ...patch, user_id: user.id, session_id, tournament_id })
      }
    } else {
      const existing = await findRow(admin, null, session_id, tournament_id)

      if (existing) {
        if (source && !existing.source) patch.source = source
        await (admin.from('bracket_predictions') as any)
          .update(patch)
          .eq('id', existing.id)
      } else {
        if (source) patch.source = source
        await (admin.from('bracket_predictions') as any)
          .insert({ ...patch, session_id, tournament_id })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/bracket-prediction
// Body: { tournament_id, session_id, share_format }
// Increments share_count and records the format used.
export async function PATCH(request: NextRequest) {
  try {
    const user = await getSessionUser()
    const body = await request.json().catch(() => null)
    const { tournament_id, session_id, share_format } = body ?? {}

    if (!tournament_id || !session_id) {
      return NextResponse.json({ error: 'tournament_id and session_id required' }, { status: 400 })
    }

    const admin   = createAdminClient()
    const now     = new Date().toISOString()
    const existing = await findRow(admin, user?.id ?? null, session_id, tournament_id)
    if (!existing) return NextResponse.json({ ok: true })

    await (admin.from('bracket_predictions') as any)
      .update({
        share_count:       (existing.share_count ?? 0) + 1,
        last_share_format: share_format ?? null,
        updated_at:        now,
      })
      .eq('id', existing.id)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}
