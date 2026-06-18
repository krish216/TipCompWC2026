import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/round-debrief-card?tribe_id={id}&round=gs1
// Light gate for the homepage/leaderboard/predict card: show the Round wrap-up
// nudge only once the round is fully scored for that tribe's tournament.
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const tribeId = url.searchParams.get('tribe_id')
    const round   = url.searchParams.get('round') || 'gs1'
    if (!tribeId) return NextResponse.json({ show: false })

    const admin = createAdminClient()
    const { data: tribe } = await (admin.from('tribes') as any).select('tournament_id').eq('id', tribeId).maybeSingle()
    const tournId = (tribe as any)?.tournament_id
    if (!tournId) return NextResponse.json({ show: false })

    const { data: fx } = await (admin.from('fixtures') as any)
      .select('home_score').eq('tournament_id', tournId).eq('round', round)
    const fixtures = (fx ?? []) as any[]
    const complete = fixtures.length > 0 && fixtures.every(f => f.home_score != null)

    let roundName = 'Round 1'
    if (complete) {
      const { data: tr } = await (admin.from('tournament_rounds') as any)
        .select('round_name').eq('tournament_id', tournId).eq('round_code', round).maybeSingle()
      if ((tr as any)?.round_name) roundName = (tr as any).round_name
    }

    return NextResponse.json({ show: complete, round_code: round, round_name: roundName })
  } catch {
    return NextResponse.json({ show: false })
  }
}
