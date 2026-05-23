import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/live-pulse — public, no auth required
// Returns 24h activity counts and the latest comp-join event.
export async function GET() {
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [
      { count: compsToday },
      { count: bracketsToday },
      { count: tipstersToday },
      { data: latestRow },
    ] = await Promise.all([
      admin.from('comps').select('*', { count: 'exact', head: true }).gte('created_at', since),
      admin.from('bracket_predictions').select('*', { count: 'exact', head: true }).gte('created_at', since),
      admin.from('users').select('*', { count: 'exact', head: true }).gte('created_at', since),
      (admin as any)
        .from('user_comps')
        .select('joined_at, users(first_name, display_name), comps(name, discoverable)')
        .gte('joined_at', since)
        .order('joined_at', { ascending: false })
        .limit(1),
    ])

    let latest_event: { text: string } | null = null
    const row = latestRow?.[0] as any
    if (row) {
      const u = row.users
      const name = u?.first_name || (u?.display_name ?? '').split(' ')[0] || 'Someone'
      const compName = row.comps?.discoverable ? row.comps.name : 'a comp'
      latest_event = { text: `${name} joined ${compName}` }
    }

    return NextResponse.json(
      { comps_today: compsToday ?? 0, brackets_today: bracketsToday ?? 0, tipsters_today: tipstersToday ?? 0, latest_event },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json({ comps_today: 0, brackets_today: 0, tipsters_today: 0, latest_event: null })
  }
}
