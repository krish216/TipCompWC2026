import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// GET /api/bracket?tournament_id={id}
// Returns all bracket picks for the current user for a tournament.
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const tournamentId = searchParams.get('tournament_id')
    if (!tournamentId) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

    const admin = createAdminClient()
    const { data: rows } = await (admin.from('bracket_picks') as any)
      .select('slot_key, team_name, updated_at')
      .eq('user_id', user.id)
      .eq('tournament_id', tournamentId)

    const picks: Record<string, string | null> = {}
    for (const row of rows ?? []) {
      picks[row.slot_key] = row.team_name
    }

    return NextResponse.json({ picks })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/bracket
// Body: { tournament_id, slot_key, team_name }
// Upserts a single bracket pick.
export async function PUT(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const { tournament_id, slot_key, team_name } = body ?? {}

    if (!tournament_id || !slot_key) {
      return NextResponse.json({ error: 'tournament_id and slot_key required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await (admin.from('bracket_picks') as any)
      .upsert(
        {
          user_id: user.id,
          tournament_id,
          slot_key,
          team_name: team_name ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,tournament_id,slot_key' }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/bracket?tournament_id={id}
// Wipes all knockout picks (r32/r16/qf/sf/final) for the user; called when group/thirds change.
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const tournamentId = searchParams.get('tournament_id')
    if (!tournamentId) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

    const bracketSlots = [
      ...Array.from({ length: 16 }, (_, i) => `r32:${i + 1}`),
      ...Array.from({ length: 8 },  (_, i) => `r16:${i + 1}`),
      ...Array.from({ length: 4 },  (_, i) => `qf:${i + 1}`),
      'sf:1', 'sf:2', 'final',
    ]

    const admin = createAdminClient()
    const { error } = await (admin.from('bracket_picks') as any)
      .delete()
      .eq('user_id', user.id)
      .eq('tournament_id', tournamentId)
      .in('slot_key', bracketSlots)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}
