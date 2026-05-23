import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/live-pulse — public, no auth required
// Returns 24h activity counts and the last 5 activity events for the ticker.
export async function GET() {
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [
      { count: compsToday },
      { count: bracketsToday },
      { count: tipstersToday },
      { data: recentJoins },
      { data: recentSignups },
    ] = await Promise.all([
      admin.from('comps').select('*', { count: 'exact', head: true }).gte('created_at', since),
      admin.from('bracket_predictions').select('*', { count: 'exact', head: true }).gte('created_at', since),
      admin.from('users').select('*', { count: 'exact', head: true }).gte('created_at', since),
      (admin as any)
        .from('user_comps')
        .select('joined_at, users(first_name, display_name), comps(name, discoverable)')
        .not('joined_at', 'is', null)
        .gte('joined_at', since)
        .order('joined_at', { ascending: false })
        .limit(5),
      admin
        .from('users')
        .select('created_at, first_name, display_name')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    // Build a unified event list, merge and sort by timestamp, take top 5
    type Event = { text: string; ts: string }
    const events: Event[] = []

    for (const row of (recentJoins ?? []) as any[]) {
      const name = row.users?.first_name || (row.users?.display_name ?? '').split(' ')[0] || 'Someone'
      const compName = row.comps?.discoverable ? row.comps.name : 'a comp'
      events.push({ text: `${name} joined ${compName}`, ts: row.joined_at })
    }

    for (const row of (recentSignups ?? []) as any[]) {
      const name = row.first_name || (row.display_name ?? '').split(' ')[0] || 'Someone'
      events.push({ text: `${name} joined TribePicks`, ts: row.created_at })
    }

    events.sort((a, b) => b.ts.localeCompare(a.ts))
    const top5 = events.slice(0, 5).map(e => e.text)

    return NextResponse.json(
      { comps_today: compsToday ?? 0, brackets_today: bracketsToday ?? 0, tipsters_today: tipstersToday ?? 0, events: top5 },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json({ comps_today: 0, brackets_today: 0, tipsters_today: 0, events: [] })
  }
}
