import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { getDefaultScoringConfig, calcPoints } from '@/types'

// POST /api/demo/generate
// Tournament admin only. Steps:
//  1. Copy GS fixtures from real fixtures → demo_fixtures (idempotent)
//  2. Call Claude API to generate realistic scores for all 48 GS matches
//  3. Upsert into demo_results
//  4. Recalculate demo_points for all existing demo_predictions

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const admin    = createAdminClient()

  // Auth: tournament admin only
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: isAdmin } = await admin.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const { tournament_id } = body ?? {}
  if (!tournament_id) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

  // Step 1: fetch real GS fixtures
  const { data: realFixtures, error: fxErr } = await admin
    .from('fixtures')
    .select('id, round, grp, home, away, kickoff_utc, venue, tournament_id')
    .eq('tournament_id', tournament_id)
    .eq('round', 'gs')
    .order('kickoff_utc')

  if (fxErr || !realFixtures?.length) {
    return NextResponse.json({ error: 'No GS fixtures found for this tournament' }, { status: 404 })
  }

  // Step 2: upsert demo_fixtures (idempotent — ON CONFLICT on real_fixture_id)
  const demoFxRows = realFixtures.map((f: any) => ({
    real_fixture_id: f.id,
    tournament_id:   f.tournament_id,
    round:           'gs',
    grp:             f.grp,
    home:            f.home,
    away:            f.away,
    kickoff_utc:     f.kickoff_utc,
    venue:           f.venue,
  }))

  const { error: upsertErr } = await (admin.from('demo_fixtures') as any)
    .upsert(demoFxRows, { onConflict: 'real_fixture_id', ignoreDuplicates: true })
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // Fetch the demo_fixture ids we just created
  const { data: demoFixtures } = await (admin.from('demo_fixtures') as any)
    .select('id, home, away, grp, kickoff_utc')
    .eq('tournament_id', tournament_id)
    .eq('round', 'gs')
    .order('kickoff_utc')

  if (!demoFixtures?.length) return NextResponse.json({ error: 'Demo fixtures not found after upsert' }, { status: 500 })

  // Step 3: call Claude to generate realistic GS scores
  const matchList = (demoFixtures as any[]).map((f: any, i: number) =>
    `${i + 1}. ${f.home} vs ${f.away} (Group ${f.grp})`
  ).join('\n')

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: `You are a football (soccer) match result simulator for the 2026 FIFA World Cup Group Stage.
Generate realistic, varied match scores that reflect actual team strengths.
Favourites should win more often but upsets do happen. Include draws.
Scores should look like real football: mostly 0-0 to 3-2, occasional 4+ goals for strong teams.
Respond ONLY with a JSON array, no markdown, no explanation. Each element: {"match":N,"home_score":X,"away_score":Y}`,
      messages: [{ role: 'user', content: `Generate match results for these 2026 World Cup Group Stage matches:\n\n${matchList}\n\nReturn a JSON array with one object per match.` }],
    }),
  })

  if (!claudeRes.ok) {
    const err = await claudeRes.text()
    return NextResponse.json({ error: `AI generation failed: ${err}` }, { status: 500 })
  }

  const claudeData = await claudeRes.json()
  const rawText = claudeData.content?.[0]?.text ?? ''

  let scores: { match: number; home_score: number; away_score: number }[]
  try {
    scores = JSON.parse(rawText.replace(/```json|```/g, '').trim())
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw: rawText }, { status: 500 })
  }

  // Step 4: upsert demo_results
  const resultRows = scores.map((s) => {
    const fx = (demoFixtures as any[])[s.match - 1]
    if (!fx) return null
    const h = s.home_score, a = s.away_score
    const result_outcome = h > a ? 'H' : a > h ? 'A' : 'D'
    return { demo_fixture_id: fx.id, home_score: h, away_score: a, result_outcome, generated_at: new Date().toISOString() }
  }).filter(Boolean)

  const { error: resErr } = await (admin.from('demo_results') as any)
    .upsert(resultRows, { onConflict: 'demo_fixture_id', ignoreDuplicates: false })
  if (resErr) return NextResponse.json({ error: resErr.message }, { status: 500 })

  // Step 5: recalculate demo_points for all existing predictions
  const { data: allPreds } = await (admin.from('demo_predictions') as any)
    .select('id, user_id, demo_fixture_id, outcome')
    .in('demo_fixture_id', (demoFixtures as any[]).map((f: any) => f.id))

  if (allPreds?.length) {
    const resultMap: Record<number, { home_score: number; away_score: number; result_outcome: string }> = {}
    resultRows.forEach((r: any) => { if (r) resultMap[r.demo_fixture_id] = r })

    const cfg = getDefaultScoringConfig()
    const pointRows = (allPreds as any[]).map((p: any) => {
      const res = resultMap[p.demo_fixture_id]
      if (!res) return null
      const pred = { home: null, away: null, pen_winner: null, outcome: p.outcome }
      const result = { home: res.home_score, away: res.away_score, result_outcome: res.result_outcome, pen_winner: null }
      const pts = calcPoints(pred as any, result, 'gs', false, cfg) ?? 0
      return {
        user_id:         p.user_id,
        demo_fixture_id: p.demo_fixture_id,
        points:          pts,
        is_correct:      pts > 0,
        calculated_at:   new Date().toISOString(),
      }
    }).filter(Boolean)

    if (pointRows.length) {
      await (admin.from('demo_points') as any)
        .upsert(pointRows, { onConflict: 'user_id,demo_fixture_id', ignoreDuplicates: false })
    }
  }

  return NextResponse.json({
    success:          true,
    fixtures_created: demoFixtures.length,
    results_generated: resultRows.length,
  })
}
