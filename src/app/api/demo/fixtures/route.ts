import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// GET /api/demo/fixtures?tournament_id=
// Returns demo fixtures. For each fixture:
//   - result is included ONLY if the calling user has submitted a prediction for it
//   - If no user session, result is never included (encourage sign-up)
// Public route — no auth required to see fixtures, just not results

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tournament_id = searchParams.get('tournament_id')
  if (!tournament_id) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

  const admin = createAdminClient()

  // Get current user (optional)
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  // Fetch fixtures + results
  const { data: fixtures, error: fxErr } = await (admin.from('demo_fixtures') as any)
    .select(`
      id, round, grp, home, away, kickoff_utc, venue,
      demo_results (home_score, away_score, result_outcome)
    `)
    .eq('tournament_id', tournament_id)
    .order('kickoff_utc')

  if (fxErr) return NextResponse.json({ error: fxErr.message }, { status: 500 })
  if (!fixtures?.length) return NextResponse.json({ data: [], has_results: false })

  // Fetch this user's predictions (to know which results to reveal)
  let predictedFixtureIds = new Set<number>()
  let userPredictions: Record<number, { outcome: string }> = {}
  if (userId) {
    const { data: preds } = await (admin.from('demo_predictions') as any)
      .select('demo_fixture_id, outcome')
      .eq('user_id', userId)
    ;(preds ?? []).forEach((p: any) => {
      predictedFixtureIds.add(p.demo_fixture_id)
      userPredictions[p.demo_fixture_id] = { outcome: p.outcome }
    })
  }

  const hasResults = (fixtures as any[]).some((f: any) => f.demo_results?.home_score != null)

  const data = (fixtures as any[]).map((f: any) => {
    const res = f.demo_results
    const hasPredicted = predictedFixtureIds.has(f.id)
    return {
      id:          f.id,
      round:       f.round,
      group:       f.grp,
      home:        f.home,
      away:        f.away,
      kickoff_utc: f.kickoff_utc,
      venue:       f.venue,
      // Only reveal result after user has predicted
      result:      (res?.home_score != null && hasPredicted)
        ? { home: res.home_score, away: res.away_score, result_outcome: res.result_outcome }
        : null,
      has_result:  res?.home_score != null,  // tells UI a result exists (to show "predict to reveal")
      prediction:  hasPredicted ? userPredictions[f.id] : null,
    }
  })

  return NextResponse.json({ data, has_results: hasResults })
}
