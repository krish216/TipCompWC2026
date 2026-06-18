import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { getOutcome } from '@/types'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/admin/fixture-pickstats?fixture_id=  (admin)
// Tournament-wide aggregate of how EVERYONE picked a fixture — for stats sharing.
// Aggregate only (no individual users). Revealed once the fixture is settled or
// kicked off (picks are frozen), mirroring the tribe tipsheet's reveal rule.
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: isAdmin } = await (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const fixtureId = parseInt(new URL(request.url).searchParams.get('fixture_id') ?? '')
  if (!fixtureId) return NextResponse.json({ error: 'fixture_id required' }, { status: 400 })

  const { data: fx } = await (admin.from('fixtures') as any)
    .select('id, round, home, away, kickoff_utc, home_score, away_score, pen_winner, tournament_id')
    .eq('id', fixtureId).maybeSingle()
  if (!fx) return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })

  const resultAvailable = (fx as any).home_score != null
  const kickedOff       = Date.now() >= new Date((fx as any).kickoff_utc).getTime()
  if (!resultAvailable && !kickedOff)
    return NextResponse.json({ error: 'Picks are hidden until kickoff.' }, { status: 409 })

  // Just the outcome distribution — where the percentages go.
  const { data: preds } = await (admin.from('predictions') as any)
    .select('home, away, outcome').eq('fixture_id', fixtureId)
  const rows = (preds ?? []) as any[]

  let H = 0, D = 0, A = 0
  for (const p of rows) {
    const out = (p.outcome as 'H' | 'D' | 'A' | null) ?? getOutcome(p.home, p.away)
    if (out === 'H') H++; else if (out === 'A') A++; else D++
  }
  const total = rows.length
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)

  return NextResponse.json({
    fixture: { id: (fx as any).id, round: (fx as any).round, home: (fx as any).home, away: (fx as any).away,
      home_score: (fx as any).home_score, away_score: (fx as any).away_score },
    total_predictions: total,
    aggregate: { H, D, A, home_pct: pct(H), draw_pct: pct(D), away_pct: pct(A) },
  })
}
