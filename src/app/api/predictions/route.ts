import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { z } from 'zod'

const PredictionSchema = z.object({
  fixture_id: z.number().int().positive(),
  home:       z.number().int().min(0).max(30).optional(),
  away:       z.number().int().min(0).max(30).optional(),
  outcome:    z.enum(['H','D','A']).nullable().optional(),
  pen_winner: z.string().nullable().optional(),
})
const BulkSchema = z.object({ predictions: z.array(PredictionSchema).min(1).max(20) })

// Helper: get user's active tournament id
async function getActiveTournamentId(supabase: any, userId: string): Promise<string | null> {
  const { data: userRow } = await supabase
    .from('users').select('active_tournament_id').eq('id', userId).single()
  if ((userRow as any)?.active_tournament_id) return (userRow as any).active_tournament_id

  const { data: setting } = await supabase
    .from('app_settings').select('value').eq('key', 'active_tournament_id').single()
  return (setting as any)?.value ?? null
}

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const round        = searchParams.get('round')
  const fixture_id   = searchParams.get('fixture_id')
  const tournament_id = searchParams.get('tournament_id') ?? await getActiveTournamentId(supabase, user.id)

  let query = supabase
    .from('predictions')
    .select('id, fixture_id, home, away, outcome, pen_winner, points_earned, tournament_id, created_at, updated_at, fixtures!inner(round, kickoff_utc, home_score, away_score, pen_winner, result_outcome, tournament_id)')
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
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const isBulk = Array.isArray(body?.predictions)
  const parsed = isBulk ? BulkSchema.safeParse(body) : BulkSchema.safeParse({ predictions: [body] })
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })

  const { predictions } = parsed.data
  const fixtureIds = predictions.map(p => p.fixture_id)

  // Get active tournament for this user
  const tournamentId = await getActiveTournamentId(supabase, user.id)

  // Validate fixtures belong to the active tournament and check lockout
  const { data: fixturesRaw } = await supabase
    .from('fixtures')
    .select('id, round, kickoff_utc, home_score, tournament_id')
    .in('id', fixtureIds)
  const fixtures = (fixturesRaw ?? []) as any[]

  // Reject if any fixture is from a different tournament
  if (tournamentId) {
    const wrongTourn = fixtures.filter((f: any) => f.tournament_id && f.tournament_id !== tournamentId)
    if (wrongTourn.length > 0) {
      return NextResponse.json({ error: 'Fixture does not belong to your active tournament' }, { status: 409 })
    }
  }

  const { data: roundLockRows } = await supabase
    .from('round_locks').select('round, is_open')
  const hasLockRows = (roundLockRows ?? []).length > 0
  const openRounds  = new Set((roundLockRows ?? []).filter((r: any) => r.is_open).map((r: any) => r.round))

  const now = new Date(); const locked: number[] = []
  fixtures.forEach((fx: any) => {
    const kickoffLocked = (new Date(fx.kickoff_utc).getTime() - now.getTime()) / 60000 <= 5
    const roundLocked   = hasLockRows ? !openRounds.has(fx.round) : fx.round !== 'gs'
    const hasResult     = fx.home_score !== null
    if (kickoffLocked || roundLocked || hasResult) locked.push(fx.id)
  })
  if (locked.length > 0) return NextResponse.json({ error: 'This round is not open for predictions yet.' }, { status: 409 })

  const rows = predictions.map((p: any) => {
    const isOutcome = p.outcome != null
    return {
      user_id:       user.id,
      fixture_id:    p.fixture_id,
      tournament_id: tournamentId,   // ← link to active tournament
      home:          isOutcome ? 0 : (p.home ?? 0),
      away:          isOutcome ? 0 : (p.away ?? 0),
      outcome:       p.outcome ?? null,
      pen_winner:    p.pen_winner ?? null,
      points_earned: null,
    }
  })

  const { data, error } = await (supabase.from('predictions') as any)
    .upsert(rows, { onConflict: 'user_id,fixture_id', ignoreDuplicates: false })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count: data?.length }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const fixture_id = parseInt(new URL(request.url).searchParams.get('fixture_id') ?? '')
  if (isNaN(fixture_id)) return NextResponse.json({ error: 'fixture_id required' }, { status: 400 })

  const { data: fxRaw } = await supabase.from('fixtures').select('kickoff_utc, home_score').eq('id', fixture_id).single()
  const fx = fxRaw as any
  if (!fx) return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })
  if ((new Date(fx.kickoff_utc).getTime() - Date.now()) / 60000 <= 5 || fx.home_score !== null)
    return NextResponse.json({ error: 'Cannot withdraw after lockout' }, { status: 409 })

  const { error } = await supabase.from('predictions').delete().match({ user_id: user.id, fixture_id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
