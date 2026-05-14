import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// POST /api/bracket-prediction
// Body: { tournament_id, champion, runner_up, session_id }
// Upserts a champion + runner-up prediction for the current session / user.
// - Signed-in: upserts by (user_id, tournament_id), claims guest row if one exists for session_id
// - Guest:     upserts by (session_id, tournament_id)
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser()
    const body = await request.json().catch(() => null)
    const { tournament_id, champion, runner_up, session_id } = body ?? {}

    if (!tournament_id || !session_id) {
      return NextResponse.json({ error: 'tournament_id and session_id required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const now   = new Date().toISOString()

    if (user) {
      // Signed-in: prefer the row keyed to user_id
      const { data: byUser } = await (admin.from('bracket_predictions') as any)
        .select('id')
        .eq('user_id', user.id)
        .eq('tournament_id', tournament_id)
        .maybeSingle()

      if (byUser) {
        await (admin.from('bracket_predictions') as any)
          .update({ champion, runner_up, session_id, updated_at: now })
          .eq('id', byUser.id)
      } else {
        // Claim the guest row if it exists for this session_id
        const { data: bySession } = await (admin.from('bracket_predictions') as any)
          .select('id')
          .eq('session_id', session_id)
          .eq('tournament_id', tournament_id)
          .maybeSingle()

        if (bySession) {
          await (admin.from('bracket_predictions') as any)
            .update({ user_id: user.id, champion, runner_up, updated_at: now })
            .eq('id', bySession.id)
        } else {
          await (admin.from('bracket_predictions') as any)
            .insert({ user_id: user.id, session_id, tournament_id, champion, runner_up })
        }
      }
    } else {
      // Guest: upsert by session_id + tournament_id
      const { data: bySession } = await (admin.from('bracket_predictions') as any)
        .select('id')
        .eq('session_id', session_id)
        .eq('tournament_id', tournament_id)
        .maybeSingle()

      if (bySession) {
        await (admin.from('bracket_predictions') as any)
          .update({ champion, runner_up, updated_at: now })
          .eq('id', bySession.id)
      } else {
        await (admin.from('bracket_predictions') as any)
          .insert({ session_id, tournament_id, champion, runner_up })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}
