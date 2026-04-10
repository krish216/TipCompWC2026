import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import type { RoundId } from '@/types'

// GET /api/leaderboard?scope=tribe|org|global
export async function GET(request: NextRequest) {
  try {
    const supabase     = createServerSupabaseClient()
    const adminClient  = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const scope = searchParams.get('scope') ?? 'org'
    const limit = scope === 'tribe' ? 25 : 50

    // Get user context
    const { data: meRow } = await supabase
      .from('users').select('tribe_id, org_id').eq('id', user.id).single()
    const tribeId = (meRow as any)?.tribe_id ?? null
    const orgId   = (meRow as any)?.org_id   ?? null

    if (scope === 'tribe' && !tribeId) {
      return NextResponse.json({ data: [], my_entry: null, total: 0, message: 'You are not in a tribe yet.' })
    }

    // Resolve user IDs for scope filter
    let scopeUserIds: string[] | null = null

    if (scope === 'tribe' && tribeId) {
      const { data: members } = await adminClient
        .from('tribe_members').select('user_id').eq('tribe_id', tribeId)
      scopeUserIds = (members ?? []).map((m: any) => m.user_id)
      if (scopeUserIds.length === 0) return NextResponse.json({ data: [], my_entry: null, total: 0 })
    } else if (scope === 'org' && orgId) {
      const { data: members } = await adminClient
        .from('users').select('id').eq('org_id', orgId)
      scopeUserIds = (members ?? []).map((m: any) => m.id)
      if (scopeUserIds.length === 0) return NextResponse.json({ data: [], my_entry: null, total: 0 })
    }

    // Query leaderboard view
    let lbQuery = (adminClient.from('leaderboard') as any)
      .select('user_id, display_name, tribe_name, tribe_id, org_name, org_id, total_points, exact_count, correct_count, predictions_made')
      .order('total_points', { ascending: false })
      .order('exact_count',  { ascending: false })
      .limit(limit)

    if (scopeUserIds) lbQuery = lbQuery.in('user_id', scopeUserIds)

    const { data: lbData, error: lbError } = await lbQuery
    if (lbError) return NextResponse.json({ error: lbError.message }, { status: 500 })
    const rows = (lbData ?? []) as any[]

    // Build fixture → round map (single query, no join)
    const { data: fixRows } = await adminClient
      .from('fixtures').select('id, round').not('home_score', 'is', null)
    const fixtureRoundMap: Record<number, RoundId> = {}
    ;(fixRows ?? []).forEach((f: any) => { fixtureRoundMap[f.id] = f.round })

    // Build round breakdown per user using admin client (bypasses RLS)
    const userIds = rows.map((r: any) => r.user_id)
    const breakdownMap: Record<string, Record<RoundId, number>> = {}

    if (userIds.length > 0) {
      const { data: predRows } = await (adminClient.from('predictions') as any)
        .select('user_id, fixture_id, points_earned')
        .in('user_id', userIds)
        .not('points_earned', 'is', null)
        .gt('points_earned', 0)

      ;(predRows ?? []).forEach((p: any) => {
        const round = fixtureRoundMap[p.fixture_id]
        if (!round) return
        if (!breakdownMap[p.user_id]) breakdownMap[p.user_id] = {} as Record<RoundId, number>
        breakdownMap[p.user_id][round] = (breakdownMap[p.user_id][round] ?? 0) + (Number(p.points_earned) || 0)
      })
    }

    const ranked = rows.map((row: any, i: number) => ({
      ...row,
      rank:            i + 1,
      is_me:           row.user_id === user.id,
      round_breakdown: breakdownMap[row.user_id] ?? {},
    }))

    // Always return current user's entry even if outside top 50
    let myEntry = ranked.find((r: any) => r.is_me) ?? null
    if (!myEntry) {
      const { data: myRaw } = await (adminClient.from('leaderboard') as any)
        .select('user_id, display_name, tribe_name, tribe_id, org_name, org_id, total_points, exact_count, correct_count, predictions_made')
        .eq('user_id', user.id).single()
      if (myRaw) {
        const m = myRaw as any
        const { count: ahead } = await (adminClient.from('leaderboard') as any)
          .select('user_id', { count: 'exact', head: true })
          .gt('total_points', m.total_points)
        myEntry = {
          ...m, is_me: true,
          rank: (ahead ?? 0) + 1,
          round_breakdown: breakdownMap[user.id] ?? {},
        }
      }
    }

    return NextResponse.json({ data: ranked, my_entry: myEntry, total: rows.length })

  } catch (err: any) {
    console.error('Leaderboard error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
