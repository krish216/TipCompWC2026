import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { getDefaultScoringConfig, calcPoints } from '@/types'

// POST /api/demo/predictions
// Submit a prediction for a demo fixture. Immediately computes and stores points.
// Body: { demo_fixture_id, outcome }  ('H' | 'A' | 'D')
// Returns: { prediction, points, result } — reveals the AI result right away

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { demo_fixture_id, outcome } = body ?? {}

  if (!demo_fixture_id || !outcome || !['H', 'A', 'D'].includes(outcome)) {
    return NextResponse.json({ error: 'demo_fixture_id and outcome (H/A/D) required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch the demo result for this fixture
  const { data: res } = await (admin.from('demo_results') as any)
    .select('home_score, away_score, result_outcome')
    .eq('demo_fixture_id', demo_fixture_id)
    .maybeSingle()

  if (!res) return NextResponse.json({ error: 'No AI result found for this fixture — ask the admin to generate results first' }, { status: 404 })

  // Upsert prediction (allow re-predicting before result is locked — but for demo we allow it always)
  const { error: predErr } = await (admin.from('demo_predictions') as any)
    .upsert(
      { user_id: user.id, demo_fixture_id, outcome, submitted_at: new Date().toISOString() },
      { onConflict: 'user_id,demo_fixture_id', ignoreDuplicates: false }
    )
  if (predErr) return NextResponse.json({ error: predErr.message }, { status: 500 })

  // Calculate and store points
  const cfg = getDefaultScoringConfig()
  const pred   = { home: null, away: null, pen_winner: null, outcome }
  const result = { home: res.home_score, away: res.away_score, result_outcome: res.result_outcome, pen_winner: null }
  const pts    = calcPoints(pred as any, result, 'gs', false, cfg) ?? 0

  await (admin.from('demo_points') as any)
    .upsert(
      { user_id: user.id, demo_fixture_id, points: pts, is_correct: pts > 0, calculated_at: new Date().toISOString() },
      { onConflict: 'user_id,demo_fixture_id', ignoreDuplicates: false }
    )

  return NextResponse.json({
    success:    true,
    prediction: { outcome },
    result:     { home: res.home_score, away: res.away_score, result_outcome: res.result_outcome },
    points:     pts,
    is_correct: pts > 0,
  })
}
