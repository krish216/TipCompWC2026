import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// GET /api/fixtures?round=gs&group=A
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { searchParams } = new URL(request.url)
  const round = searchParams.get('round')
  const group = searchParams.get('group')

  let query = supabase
    .from('fixtures')
    .select('id, round, grp, home, away, kickoff_utc, venue, home_score, away_score')
    .order('kickoff_utc')

  if (round) query = query.eq('round', round)
  if (group) query = query.eq('grp', group)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cast to any[] to avoid TypeScript narrowing to never[] on chained queries
  const rows = (data ?? []) as any[]

  const fixtures = rows.map(f => ({
    id:          f.id,
    round:       f.round,
    group:       f.grp,
    home:        f.home,
    away:        f.away,
    kickoff_utc: f.kickoff_utc,
    venue:       f.venue,
    result:      f.home_score != null
      ? { home: f.home_score, away: f.away_score }
      : null,
  }))

  return NextResponse.json({ data: fixtures })
}
