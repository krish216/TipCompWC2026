import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { fixtureHasPlaceholder, knownTeamSet } from '@/lib/placeholder'
import { z } from 'zod'

const PredictionSchema = z.object({
  fixture_id: z.number().int().positive(),
  home:       z.number().int().min(0).max(30).optional(),
  away:       z.number().int().min(0).max(30).optional(),
  outcome:    z.enum(['H','D','A']).nullable().optional(),
  pen_winner: z.string().nullable().optional(),
})
const BulkSchema = z.object({ predictions: z.array(PredictionSchema).min(1).max(20) })

// Helper: get user's active tournament from preferences
// Uses admin client to bypass RLS — tournament_id is NOT NULL on predictions,
// so returning null would cause a constraint error on insert.
async function getActiveTournamentId(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: prefs } = await (admin.from('user_preferences') as any)
    .select('tournament_id').eq('user_id', userId).maybeSingle()
  if ((prefs as any)?.tournament_id) return (prefs as any).tournament_id

  const { data: active } = await (admin.from('tournaments') as any)
    .select('id').eq('is_active', true)
    .order('start_date', { ascending: true }).limit(1)
  if ((active as any)?.[0]?.id) return (active as any)[0].id

  const { data: setting } = await (admin.from('app_settings') as any)
    .select('value').eq('key', 'active_tournament_id').maybeSingle()
  return (setting as any)?.value ?? null
}

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const round        = searchParams.get('round')
  const fixture_id   = searchParams.get('fixture_id')
  const tournament_id = searchParams.get('tournament_id') ?? await getActiveTournamentId(user.id)

  let query = supabase
    .from('predictions')
    .select('id, fixture_id, home, away, outcome, pen_winner, locked_at, points_earned, standard_points, bonus_points, tournament_id, created_at, updated_at, fixtures!inner(round, kickoff_utc, home_score, away_score, pen_winner, result_outcome, tournament_id)')
    .eq('user_id', user.id)
    .order('fixture_id')

  // Filter by tournament
  if (tournament_id) query = query.eq('tournament_id', tournament_id)

  if (round)      query = query.eq('fixtures.round', round)
  if (fixture_id) query = query.eq('fixture_id', parseInt(fixture_id))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient()
    const user  = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const isBulk = Array.isArray(body?.predictions)
    const parsed = isBulk ? BulkSchema.safeParse(body) : BulkSchema.safeParse({ predictions: [body] })
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })

    const { predictions } = parsed.data
    const fixtureIds = predictions.map(p => p.fixture_id)

    const tournamentId = await getActiveTournamentId(user.id)
    if (!tournamentId) return NextResponse.json({ error: 'No active tournament found' }, { status: 400 })

    const { data: fixturesRaw } = await (admin.from('fixtures') as any)
      .select('id, round, kickoff_utc, home_score, tournament_id, home, away')
      .in('id', fixtureIds)
    const fixtures = (fixturesRaw ?? []) as any[]

    const wrongTourn = fixtures.filter((f: any) => f.tournament_id && f.tournament_id !== tournamentId)
    if (wrongTourn.length > 0) {
      return NextResponse.json({ error: 'Fixture does not belong to your active tournament' }, { status: 409 })
    }

    // A knockout fixture whose teams haven't been decided yet can't be tipped — even
    // if the round is open. Authoritative check: a side must be a real tournament team
    // (placeholders like "Winner Group A" / "TBD R32-1" simply aren't in the list).
    const { data: teamRows } = await (admin.from('tournament_teams') as any)
      .select('name').eq('tournament_id', tournamentId)
    const known = knownTeamSet((teamRows ?? []).map((t: any) => t.name))
    if (fixtures.some((f: any) => fixtureHasPlaceholder(f, known))) {
      return NextResponse.json({ error: 'This match can’t be tipped yet — the teams haven’t been confirmed.' }, { status: 409 })
    }

    const { data: tournRow } = await (admin.from('tournaments') as any)
      .select('allow_retroactive_predictions').eq('id', tournamentId).maybeSingle()
    const retroactive = (tournRow as any)?.allow_retroactive_predictions === true

    const { data: roundLockRows } = await (admin.from('round_locks') as any)
      .select('round_code, is_open').eq('tournament_id', tournamentId)
    const hasLockRows = (roundLockRows ?? []).length > 0
    const openRounds  = new Set((roundLockRows ?? []).filter((r: any) => r.is_open).map((r: any) => r.round_code))

    const now = new Date(); const locked: number[] = []
    fixtures.forEach((fx: any) => {
      const roundLocked = hasLockRows ? !openRounds.has(fx.round) : fx.round !== 'gs'
      if (roundLocked) { locked.push(fx.id); return }  // round lock always enforced
      if (!retroactive) {
        const kickoffLocked = (new Date(fx.kickoff_utc).getTime() - now.getTime()) / 60000 <= 5
        const hasResult     = fx.home_score !== null
        if (kickoffLocked || hasResult) locked.push(fx.id)
      }
    })
    if (locked.length > 0) return NextResponse.json({ error: 'This round is not open for predictions yet.' }, { status: 409 })

    // ── LOCKED-IN CHECK ──────────────────────────────────────────────────────
    // A prediction the user has voluntarily locked in (locked_at set) is final
    // and cannot be edited — even while the round is still open.
    const { data: lockedInRows } = await (admin.from('predictions') as any)
      .select('fixture_id').eq('user_id', user.id).in('fixture_id', fixtureIds).not('locked_at', 'is', null)
    if ((lockedInRows ?? []).length > 0) {
      return NextResponse.json({
        error: 'A locked-in prediction cannot be changed.',
        locked_fixture_ids: (lockedInRows ?? []).map((r: any) => r.fixture_id),
      }, { status: 409 })
    }

    const rows = predictions.map((p: any) => {
      const isOutcome = p.outcome != null
      return {
        user_id:       user.id,
        fixture_id:    p.fixture_id,
        tournament_id: tournamentId,
        home:          isOutcome ? 0 : (p.home ?? 0),
        away:          isOutcome ? 0 : (p.away ?? 0),
        outcome:       p.outcome ?? null,
        pen_winner:    p.pen_winner ?? null,
        // Do NOT include points_earned — the DB trigger owns scoring.
        // Setting it to null on UPDATE fires trg_refresh_lb which can fail
        // if the leaderboard view has constraint violations.
      }
    })

    const { data, error } = await (admin.from('predictions') as any)
      .upsert(rows, { onConflict: 'user_id,fixture_id', ignoreDuplicates: false })
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, count: data?.length }, { status: 201 })
  } catch (err: any) {
    console.error('[predictions POST]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const round       = searchParams.get('round')
  const fixture_id  = parseInt(searchParams.get('fixture_id') ?? '')

  // ── Bulk clear for practice mode ──────────────────────────────────────────
  // Accepts ?round=gs&tournament_id=... and clears all predictions for that
  // round. Only permitted when allow_retroactive_predictions = true.
  if (round) {
    const admin = createAdminClient()
    const tournament_id = searchParams.get('tournament_id') ?? await getActiveTournamentId(user.id)
    if (!tournament_id) return NextResponse.json({ error: 'No active tournament' }, { status: 400 })

    const { data: tournRow } = await (admin.from('tournaments') as any)
      .select('allow_retroactive_predictions').eq('id', tournament_id).maybeSingle()
    if (!(tournRow as any)?.allow_retroactive_predictions)
      return NextResponse.json({ error: 'Practice clear only available in demo mode' }, { status: 403 })

    // Collect fixture IDs for this round
    const { data: fxRows } = await (admin.from('fixtures') as any)
      .select('id').eq('tournament_id', tournament_id).eq('round', round)
    const fixtureIds = (fxRows ?? []).map((f: any) => f.id)
    if (!fixtureIds.length) return NextResponse.json({ ok: true, deleted: 0 })

    const { error } = await (admin.from('predictions') as any)
      .delete().eq('user_id', user.id).in('fixture_id', fixtureIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: fixtureIds.length })
  }

  // ── Single-fixture delete (existing behaviour) ────────────────────────────
  if (isNaN(fixture_id)) return NextResponse.json({ error: 'fixture_id or round required' }, { status: 400 })

  const { data: fxRaw } = await supabase.from('fixtures').select('kickoff_utc, home_score').eq('id', fixture_id).single()
  const fx = fxRaw as any
  if (!fx) return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })
  if ((new Date(fx.kickoff_utc).getTime() - Date.now()) / 60000 <= 5 || fx.home_score !== null)
    return NextResponse.json({ error: 'Cannot withdraw after lockout' }, { status: 409 })

  // A locked-in prediction is final — it cannot be withdrawn.
  const { data: predLock } = await (supabase.from('predictions') as any)
    .select('locked_at').eq('user_id', user.id).eq('fixture_id', fixture_id).maybeSingle()
  if ((predLock as any)?.locked_at)
    return NextResponse.json({ error: 'A locked-in prediction cannot be withdrawn.' }, { status: 409 })

  const { error } = await (supabase.from('predictions') as any).delete().match({ user_id: user.id, fixture_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
