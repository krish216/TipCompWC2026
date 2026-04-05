import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// Vercel cron: runs every 2 minutes during tournament
// vercel.json: { "crons": [{ "path": "/api/scores/sync", "schedule": "*/2 * * * *" }] }
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()

  // Only run during tournament dates
  const TOURNAMENT_START = new Date('2026-06-11')
  const TOURNAMENT_END   = new Date('2026-07-20')
  if (now < TOURNAMENT_START || now > TOURNAMENT_END) {
    return NextResponse.json({ skipped: 'Outside tournament window' })
  }

  // Find fixtures that started 90-150 mins ago with no result yet (likely finished)
  const windowStart = new Date(now.getTime() - 150 * 60000).toISOString()
  const windowEnd   = new Date(now.getTime() -  90 * 60000).toISOString()

  const { data: pendingFixtures } = await supabase
    .from('fixtures')
    .select('id, home, away')
    .gte('kickoff_utc', windowStart)
    .lte('kickoff_utc', windowEnd)
    .is('home_score', null)

  const pending = (pendingFixtures ?? []) as any[]
  if (!pending.length) {
    return NextResponse.json({ updated: 0, message: 'No pending fixtures' })
  }

  const apiKey = process.env.API_FOOTBALL_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API_FOOTBALL_KEY not configured' }, { status: 500 })
  }

  let updated = 0

  for (const fixture of pending) {
    try {
      // Query API-Football for this fixture's result
      // In production, you'd map fixture.id to the API-Football fixture ID
      const res = await fetch(
        `https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${now.toISOString().split('T')[0]}&league=1&season=2026`,
        {
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
          },
        }
      )

      if (!res.ok) continue

      const json = await res.json()
      const apiFixtures = json.response ?? []

      // Find matching fixture by team names
      const match = apiFixtures.find((f: any) => {
        const home = f.teams?.home?.name?.toLowerCase()
        const away = f.teams?.away?.name?.toLowerCase()
        return (
          home?.includes((fixture.home as string).toLowerCase()) ||
          (fixture.home as string).toLowerCase().includes(home ?? '')
        ) && (
          away?.includes((fixture.away as string).toLowerCase()) ||
          (fixture.away as string).toLowerCase().includes(away ?? '')
        )
      })

      if (!match) continue

      const status = match.fixture?.status?.short
      const homeScore = match.goals?.home
      const awayScore = match.goals?.away

      // Only save if match is finished (FT, AET, PEN)
      if (!['FT', 'AET', 'PEN'].includes(status)) continue
      if (homeScore === null || homeScore === undefined) continue
      if (awayScore === null || awayScore === undefined) continue

      await supabase
        .from('fixtures')
        .update({
          home_score: homeScore,
          away_score: awayScore,
          result_set_at: new Date().toISOString(),
          result_set_by: null, // automated
        })
        .eq('id', fixture.id)

      updated++
      console.log(`[scores/sync] Updated fixture ${fixture.id}: ${fixture.home as string} ${homeScore}-${awayScore} ${fixture.away as string}`)

    } catch (err) {
      console.error(`[scores/sync] Error for fixture ${fixture.id}:`, err)
    }
  }

  return NextResponse.json({
    updated,
    checked: pending.length,
    timestamp: now.toISOString(),
  })
}
