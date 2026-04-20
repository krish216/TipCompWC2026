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
    const scope = searchParams.get('scope') ?? 'comp'
    const limit = scope === 'tribe' ? 25 : 50

    // Resolve comp + tournament from user_preferences
    const { data: prefs } = await supabase
      .from('user_preferences').select('comp_id, tournament_id').eq('user_id', user.id).single()
    const compId = (prefs as any)?.comp_id ?? null
    let tournamentId = searchParams.get('tournament_id') ?? (prefs as any)?.tournament_id ?? null

    // Resolve tribe scoped to the user's selected comp
    // Use adminClient — user-scoped client with .single() can silently fail on RLS edge cases
    let tribeId: string | null = null
    if (compId) {
      const { data: tribeRows } = await (adminClient.from('tribe_members') as any)
        .select('tribe_id, tribes!inner(comp_id)')
        .eq('user_id', user.id)
        .eq('tribes.comp_id', compId)
        .limit(1)
      tribeId = (tribeRows?.[0] as any)?.tribe_id ?? null
    } else {
      // Fallback: any tribe this user is in
      const { data: tribeRows } = await (adminClient.from('tribe_members') as any)
        .select('tribe_id').eq('user_id', user.id).limit(1)
      tribeId = (tribeRows?.[0] as any)?.tribe_id ?? null
    }
    if (!tournamentId) {
      const { data: active } = await supabase
        .from('tournaments').select('id').eq('is_active', true)
        .order('start_date', { ascending: true }).limit(1)
      tournamentId = (active as any)?.[0]?.id ?? null
    }
    if (!tournamentId) {
      const { data: setting } = await supabase
        .from('app_settings').select('value').eq('key', 'active_tournament_id').single()
      tournamentId = (setting as any)?.value ?? null
    }

    if (scope === 'tribe' && !tribeId) {
      return NextResponse.json({ data: [], my_entry: null, total: 0, message: 'You are not in a tribe yet.' })
    }

    // Global scope with no tournament — nothing to show yet
    if (scope === 'global' && !tournamentId) {
      return NextResponse.json({ data: [], my_entry: null, total: 0, message: 'No active tournament found.' })
    }

    // Resolve user IDs for scope filter
    let scopeUserIds: string[] | null = null

    if (scope === 'tribe' && tribeId) {
      const { data: members } = await adminClient
        .from('tribe_members').select('user_id').eq('tribe_id', tribeId)
      scopeUserIds = (members ?? []).map((m: any) => m.user_id)
      if (!scopeUserIds?.length) return NextResponse.json({ data: [], my_entry: null, total: 0 })
    } else if (scope === 'comp') {
      const explicitCompId = searchParams.get('comp_id')
      const effectiveCompId = explicitCompId ?? compId
      // No comp selected — return empty rather than showing everyone's data
      if (!effectiveCompId) return NextResponse.json({ data: [], my_entry: null, total: 0, message: 'No comp selected' })
      const { data: members } = await (adminClient.from('user_comps') as any)
        .select('user_id').eq('comp_id', effectiveCompId)
      scopeUserIds = (members ?? []).map((m: any) => m.user_id)
      if (!scopeUserIds?.length) return NextResponse.json({ data: [], my_entry: null, total: 0 })
    }

    // Query leaderboard view
    let lbQuery = (adminClient.from('leaderboard') as any)
      .select('user_id, display_name, tribe_name, tribe_id, comp_name, comp_id, total_points, bonus_count, correct_count, predictions_made')
      .order('total_points', { ascending: false })
      .order('bonus_count',  { ascending: false })
      .limit(limit)

    // Always filter by tournament
    if (tournamentId) lbQuery = lbQuery.eq('tournament_id', tournamentId)

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
    const tabBreakdownMap: Record<string, Record<string, number>> = {}

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

      const userTabBreakdowns = await Promise.all(userIds.map(async (userId) => {
        const { data, error } = await ((adminClient as any).rpc('get_user_tab_breakdown', { p_user_id: userId }))
        if (error) throw error
        return { userId, rows: (data ?? []) as any[] }
      }))

      userTabBreakdowns.forEach(({ userId, rows }) => {
        const map: Record<string, number> = {}
        rows.forEach((row) => {
          map[row.tab_group] = Number(row.points ?? 0)
        })
        tabBreakdownMap[userId] = map
      })
    }

    const ranked = rows.map((row: any, i: number) => ({
      ...row,
      rank:            i + 1,
      is_me:           row.user_id === user.id,
      round_breakdown: breakdownMap[row.user_id] ?? {},
      tab_breakdown:   tabBreakdownMap[row.user_id] ?? {},
    }))

    // Always return current user's entry even if outside top 50
    let myEntry = ranked.find((r: any) => r.is_me) ?? null
    if (!myEntry) {
      const myEntryQuery = (adminClient.from('leaderboard') as any)
        .select('user_id, display_name, tribe_name, tribe_id, comp_name, comp_id, total_points, bonus_count, correct_count, predictions_made')
        .eq('user_id', user.id)
      if (tournamentId) myEntryQuery.eq('tournament_id', tournamentId)
      const { data: myRaw } = await myEntryQuery.single()
      if (myRaw) {
        const m = myRaw as any
        let aheadQ = (adminClient.from('leaderboard') as any)
          .select('user_id', { count: 'bonus', head: true })
          .gt('total_points', m.total_points)
        if (tournamentId) aheadQ = aheadQ.eq('tournament_id', tournamentId)
        const { count: ahead } = await aheadQ
        myEntry = {
          ...m, is_me: true,
          rank: (ahead ?? 0) + 1,
          round_breakdown: breakdownMap[user.id] ?? {},
          tab_breakdown:   tabBreakdownMap[user.id] ?? {},
        }
      }
    }

    return NextResponse.json({ data: ranked, my_entry: myEntry, total: rows.length })

  } catch (err: any) {
    console.error('Leaderboard error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
