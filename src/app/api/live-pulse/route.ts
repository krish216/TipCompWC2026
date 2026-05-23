import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/live-pulse — public, no auth required
// Returns 24h activity counts and the latest activity event.
export async function GET() {
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [
      { count: compsToday },
      { count: bracketsToday },
      { count: tipstersToday },
      { data: latestJoin },
      { data: latestSignup },
    ] = await Promise.all([
      admin.from('comps').select('*', { count: 'exact', head: true }).gte('created_at', since),
      admin.from('bracket_predictions').select('*', { count: 'exact', head: true }).gte('created_at', since),
      admin.from('users').select('*', { count: 'exact', head: true }).gte('created_at', since),
      // Recent comp joins (joined_at set by the join route going forward)
      (admin as any)
        .from('user_comps')
        .select('joined_at, users(first_name, display_name), comps(name, discoverable)')
        .not('joined_at', 'is', null)
        .gte('joined_at', since)
        .order('joined_at', { ascending: false })
        .limit(1),
      // Fallback: recent signups
      admin
        .from('users')
        .select('created_at, first_name, display_name')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1),
    ])

    let latest_event: { text: string } | null = null

    const join = latestJoin?.[0] as any
    if (join) {
      const u = join.users
      const name = u?.first_name || (u?.display_name ?? '').split(' ')[0] || 'Someone'
      const compName = join.comps?.discoverable ? join.comps.name : 'a comp'
      latest_event = { text: `${name} joined ${compName}` }
    } else {
      const signup = latestSignup?.[0] as any
      if (signup) {
        const name = signup.first_name || (signup.display_name ?? '').split(' ')[0] || 'Someone'
        latest_event = { text: `${name} joined TribePicks` }
      }
    }

    return NextResponse.json(
      { comps_today: compsToday ?? 0, brackets_today: bracketsToday ?? 0, tipsters_today: tipstersToday ?? 0, latest_event },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json({ comps_today: 0, brackets_today: 0, tipsters_today: 0, latest_event: null })
  }
}
