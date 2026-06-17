import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import type { RoundId } from '@/types'

export const dynamic = 'force-dynamic'

// GET /api/leaderboard?scope=tribe|comp|global
export async function GET(request: NextRequest) {
  try {
    const supabase    = createServerSupabaseClient()
    const adminClient = createAdminClient()

    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const scope          = searchParams.get('scope') ?? 'comp'
    // Global scope: overall-only — no round breakdown needed, capped at top 50
    const noBreakdown    = scope === 'global' || searchParams.get('no_breakdown')     === 'true'
    const noTabBreakdown = scope === 'global' || searchParams.get('no_tab_breakdown') === 'true'

    // Resolve comp + tournament from user_preferences
    const { data: prefs } = await supabase
      .from('user_preferences').select('comp_id, tournament_id').eq('user_id', user.id).single()
    const compId = (prefs as any)?.comp_id ?? null
    let tournamentId = searchParams.get('tournament_id') ?? (prefs as any)?.tournament_id ?? null

    // effectiveCompId in outer scope — used for both scope filtering and tribe lookup
    const explicitCompId  = searchParams.get('comp_id')
    const effectiveCompId = explicitCompId ?? compId

    // Resolve tribe scoped to the user's selected comp
    let tribeId: string | null = null
    if (effectiveCompId) {
      const { data: tribeRows } = await (adminClient.from('tribe_members') as any)
        .select('tribe_id, tribes!inner(comp_id)')
        .eq('user_id', user.id)
        .eq('tribes.comp_id', effectiveCompId)
        .limit(1)
      tribeId = (tribeRows?.[0] as any)?.tribe_id ?? null
    } else {
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
      if (!effectiveCompId) return NextResponse.json({ data: [], my_entry: null, total: 0, message: 'No comp selected' })
      const { data: members } = await (adminClient.from('user_comps') as any)
        .select('user_id').eq('comp_id', effectiveCompId)
      scopeUserIds = (members ?? []).map((m: any) => m.user_id)
      if (!scopeUserIds?.length) return NextResponse.json({ data: [], my_entry: null, total: 0 })
    }

    // Query leaderboard view — tribe/comp columns removed, fetched contextually below.
    // For comp/tribe scopes, scopeUserIds already bounds the result to that group so
    // no further limit is applied — every member is returned for accurate round rankings.
    // Global scope caps at 100 to keep response size reasonable.
    let lbQuery = (adminClient.from('leaderboard') as any)
      .select('user_id, display_name, country, total_points, total_bonus_points, bonus_count, correct_count, predictions_made')
      .order('total_points', { ascending: false })
      .order('bonus_count',  { ascending: false })
    if (tournamentId) lbQuery = lbQuery.eq('tournament_id', tournamentId)
    if (scopeUserIds) lbQuery = lbQuery.in('user_id', scopeUserIds)
    else              lbQuery = lbQuery.limit(50)

    const { data: lbData, error: lbError } = await lbQuery
    if (lbError) return NextResponse.json({ error: lbError.message }, { status: 500 })
    const rows = (lbData ?? []) as any[]

    // Always include current user in downstream queries even if outside top N
    const userIds = [...new Set([...rows.map((r: any) => r.user_id), user.id])]

    // Profile fields (first_name, avatar_url, show_first_name) fetched live from users
    // so that profile updates in Settings are immediately reflected without waiting for
    // the next leaderboard view refresh (which only triggers on prediction scoring).
    const profileMap: Record<string, { first_name: string | null; avatar_url: string | null; show_first_name: boolean }> = {}
    if (userIds.length > 0) {
      const { data: profileRows } = await (adminClient.from('users') as any)
        .select('id, first_name, avatar_url, show_first_name')
        .in('id', userIds)
      ;(profileRows ?? []).forEach((p: any) => {
        profileMap[p.id] = {
          first_name:      p.first_name      ?? null,
          avatar_url:      p.avatar_url      ?? null,
          show_first_name: p.show_first_name ?? true,
        }
      })
    }

    // Tribe info: look up within the viewing comp so each row shows the correct tribe.
    // For tribe scope all users share one tribe; for comp scope each user may differ.
    const tribeInfoMap: Record<string, { tribe_id: string; tribe_name: string }> = {}
    if (userIds.length > 0) {
      if (scope === 'tribe' && tribeId) {
        const { data: t } = await (adminClient.from('tribes') as any)
          .select('id, name').eq('id', tribeId).single()
        if (t) {
          for (const uid of userIds) tribeInfoMap[uid] = { tribe_id: (t as any).id, tribe_name: (t as any).name }
        }
      } else if (effectiveCompId) {
        const { data: tribeRows } = await (adminClient.from('tribe_members') as any)
          .select('user_id, tribes!inner(id, name)')
          .in('user_id', userIds)
          .eq('tribes.comp_id', effectiveCompId)
        ;(tribeRows ?? []).forEach((row: any) => {
          tribeInfoMap[row.user_id] = { tribe_id: row.tribes.id, tribe_name: row.tribes.name }
        })
      }
    }

    // Comp name per user — shown on the GLOBAL board in place of tribe (which is
    // per-comp and undefined globally). Uses each player's currently-selected comp
    // (user_preferences.comp_id). The default 'PUBLIC' comp is filtered out in the UI.
    const compNameMap: Record<string, string> = {}
    if (scope === 'global' && userIds.length > 0) {
      const { data: prefRows } = await (adminClient.from('user_preferences') as any)
        .select('user_id, comp_id').in('user_id', userIds)
      const userComp: Record<string, string> = {}
      const compIds = new Set<string>()
      ;(prefRows ?? []).forEach((r: any) => { if (r.comp_id) { userComp[r.user_id] = r.comp_id; compIds.add(r.comp_id) } })
      if (compIds.size > 0) {
        const { data: compRows } = await (adminClient.from('comps') as any)
          .select('id, name').in('id', Array.from(compIds))
        const nameById: Record<string, string> = {}
        ;(compRows ?? []).forEach((c: any) => { nameById[c.id] = c.name })
        for (const [uid, cid] of Object.entries(userComp)) if (nameById[cid]) compNameMap[uid] = nameById[cid]
      }
    }

    // Build round/tab breakdowns (skipped when no_breakdown=true for faster responses)
    const breakdownMap: Record<string, Record<RoundId, number>> = {}
    const tabBreakdownMap: Record<string, Record<string, number>> = {}
    const tabBonusMap:    Record<string, Record<string, number>> = {}
    const standardBreakdownMap: Record<string, Record<RoundId, number>> = {}
    const bonusBreakdownMap:    Record<string, Record<RoundId, number>> = {}

    // Hoisted so prevRoundRank can reuse without a second query
    let trRows: any[] = []

    if (!noBreakdown && userIds.length > 0) {
      // Build fixture → round map (single query, no join)
      let fixQuery = adminClient.from('fixtures').select('id, round').not('home_score', 'is', null)
      if (tournamentId) fixQuery = (fixQuery as any).eq('tournament_id', tournamentId)
      const { data: fixRows } = await fixQuery
      const fixtureRoundMap: Record<number, RoundId> = {}
      ;(fixRows ?? []).forEach((f: any) => { fixtureRoundMap[f.id] = f.round })

      // Fetch tournament_rounds once — needed for round→tab fallback and prevRoundRank
      const roundTabMap: Record<string, string> = {}
      const nonScoringRounds = new Set<string>()   // rounds flagged out of scoring (e.g. 'wup')
      if (tournamentId) {
        const { data: trs } = await adminClient
          .from('tournament_rounds')
          .select('round_code, tab_group, round_order, include_in_scoring')
          .eq('tournament_id', tournamentId)
          .order('round_order', { ascending: true })
        trRows = (trs ?? []) as any[]
        for (const tr of trRows) {
          roundTabMap[tr.round_code as string] = (tr.tab_group ?? tr.round_code) as string
          if (tr.include_in_scoring === false) nonScoringRounds.add(tr.round_code as string)
        }
      }

      let predQuery = (adminClient.from('predictions') as any)
        .select('user_id, fixture_id, points_earned, standard_points, bonus_points')
        .in('user_id', userIds)
        .not('points_earned', 'is', null)
        .gt('points_earned', 0)
      if (tournamentId) predQuery = predQuery.eq('tournament_id', tournamentId)
      const { data: predRows } = await predQuery

      ;(predRows ?? []).forEach((p: any) => {
        const round = fixtureRoundMap[p.fixture_id]
        if (!round) return
        if (nonScoringRounds.has(round)) return   // keep non-scoring rounds (e.g. 'wup') off the board
        if (!breakdownMap[p.user_id])         breakdownMap[p.user_id]         = {} as Record<RoundId, number>
        if (!standardBreakdownMap[p.user_id]) standardBreakdownMap[p.user_id] = {} as Record<RoundId, number>
        if (!bonusBreakdownMap[p.user_id])    bonusBreakdownMap[p.user_id]    = {} as Record<RoundId, number>
        breakdownMap[p.user_id][round]         = (breakdownMap[p.user_id][round]         ?? 0) + (Number(p.points_earned)    || 0)
        standardBreakdownMap[p.user_id][round] = (standardBreakdownMap[p.user_id][round] ?? 0) + (Number(p.standard_points) || 0)
        bonusBreakdownMap[p.user_id][round]    = (bonusBreakdownMap[p.user_id][round]    ?? 0) + (Number(p.bonus_points)    || 0)
      })

      // Single query on materialized view — all three point components per tab_group
      if (!noTabBreakdown && tournamentId) {
        const { data: tabRows } = await (adminClient.from('leaderboard_round_breakdown') as any)
          .select('user_id, tab_group, points, bonus_points')
          .eq('tournament_id', tournamentId)
          .in('user_id', userIds)
        ;(tabRows ?? []).forEach((row: any) => {
          if (!tabBreakdownMap[row.user_id]) tabBreakdownMap[row.user_id] = {}
          if (!tabBonusMap[row.user_id])     tabBonusMap[row.user_id]     = {}
          tabBreakdownMap[row.user_id][row.tab_group] = Number(row.points)
          tabBonusMap[row.user_id][row.tab_group]     = Number(row.bonus_points)
        })

        // Fallback: if a user has round_breakdown data but nothing from the materialized view
        // (view may be stale or not yet refreshed), derive all tab breakdowns from round data.
        // This ensures users outside the top-N always have tab_breakdown populated.
        for (const [uid, rbd] of Object.entries(breakdownMap)) {
          if (!tabBreakdownMap[uid] && Object.keys(rbd).length > 0) {
            const dPts: Record<string, number>   = {}
            const dBonus: Record<string, number>  = {}
            for (const [roundCode, pts] of Object.entries(rbd)) {
              const tab    = roundTabMap[roundCode] ?? roundCode
              dPts[tab]    = (dPts[tab]   ?? 0) + Number(pts)
              dBonus[tab]  = (dBonus[tab] ?? 0) + Number(bonusBreakdownMap[uid]?.[roundCode as RoundId] || 0)
            }
            if (Object.keys(dPts).length > 0) {
              tabBreakdownMap[uid] = dPts
              tabBonusMap[uid]     = dBonus
            }
          }
        }
      }
    }

    // Compute rank at end of the previous completed tab group (used by homepage My Comps card)
    let prevRoundRank: number | null = null
    let prevRoundTab: string | null = null
    if (!noBreakdown && tournamentId && Object.keys(breakdownMap).length > 0) {
      if (trRows.length > 0) {
        const tabOrder: string[] = []
        const tabRounds: Record<string, string[]> = {}
        for (const tr of trRows as any[]) {
          const tab = (tr.tab_group ?? tr.round_code) as string
          if (!tabRounds[tab]) { tabRounds[tab] = []; tabOrder.push(tab) }
          tabRounds[tab].push(tr.round_code as string)
        }

        const roundsWithData = new Set<string>()
        for (const bd of Object.values(breakdownMap)) {
          for (const [r, pts] of Object.entries(bd)) {
            if (Number(pts) > 0) roundsWithData.add(r)
          }
        }
        const tabsWithData = tabOrder.filter(tab =>
          (tabRounds[tab] ?? []).some(r => roundsWithData.has(r))
        )

        if (tabsWithData.length >= 2) {
          const prevTab    = tabsWithData[tabsWithData.length - 2]
          prevRoundTab     = prevTab
          const prevTabIdx = tabOrder.indexOf(prevTab)
          const cumulativeRounds = new Set(
            tabOrder.slice(0, prevTabIdx + 1).flatMap(t => tabRounds[t] ?? [])
          )
          const sumThrough = (bd: Record<string, number>) =>
            Object.entries(bd)
              .filter(([r]) => cumulativeRounds.has(r))
              .reduce((s, [, v]) => s + Number(v), 0)

          const myPts = sumThrough(breakdownMap[user.id] ?? {})
          let ahead = 0
          for (const row of rows) {
            if (row.user_id === user.id) continue
            if (sumThrough(breakdownMap[row.user_id] ?? {}) > myPts) ahead++
          }
          prevRoundRank = ahead + 1
        }
      }
    }

    // first_name is exposed on every scope (incl. global) only when the user opted in
    // via show_first_name (default true), or it's the requesting user's own row.
    // Reads from profileMap (live users table) so Settings changes apply immediately.
    const resolveFirstName = (uid: string) => {
      const p = profileMap[uid]
      if (!p) return null
      if (uid === user.id) return p.first_name
      return p.show_first_name ? p.first_name : null
    }

    const ranked = rows.map((row: any, i: number) => ({
      ...row,
      rank:                i + 1,
      is_me:               row.user_id === user.id,
      first_name:          resolveFirstName(row.user_id),
      avatar_url:          profileMap[row.user_id]?.avatar_url  ?? null,
      comp_name:           compNameMap[row.user_id]             ?? null,
      tribe_id:            tribeInfoMap[row.user_id]?.tribe_id   ?? null,
      tribe_name:          tribeInfoMap[row.user_id]?.tribe_name ?? null,
      round_breakdown:     breakdownMap[row.user_id]         ?? {},
      standard_breakdown:  standardBreakdownMap[row.user_id] ?? {},
      bonus_breakdown:     bonusBreakdownMap[row.user_id]    ?? {},
      tab_breakdown:       tabBreakdownMap[row.user_id]      ?? {},
      tab_bonus_breakdown: tabBonusMap[row.user_id]          ?? {},
    }))

    // Always return current user's entry even if outside top N
    let myEntry = ranked.find((r: any) => r.is_me) ?? null
    if (myEntry) {
      // Rank the current user at the top of their tied group — consistent with the
      // frontend sort tiebreaker (is_me wins ties). Count only rows with strictly
      // more total_points to get the best rank within the tied band.
      const betterRank = rows.filter((r: any) => r.total_points > myEntry!.total_points).length + 1
      myEntry = { ...myEntry, rank: betterRank }
    }
    if (!myEntry) {
      let myEntryQuery = (adminClient.from('leaderboard') as any)
        .select('user_id, display_name, country, total_points, total_bonus_points, bonus_count, correct_count, predictions_made')
        .eq('user_id', user.id)
      if (tournamentId) myEntryQuery = myEntryQuery.eq('tournament_id', tournamentId)
      const { data: myRaw } = await myEntryQuery.single()
      if (myRaw) {
        const m = myRaw as any
        let aheadQ = (adminClient.from('leaderboard') as any)
          .select('user_id', { count: 'exact', head: true })
          .gt('total_points', m.total_points)
        if (tournamentId) aheadQ = aheadQ.eq('tournament_id', tournamentId)
        if (scopeUserIds) aheadQ = aheadQ.in('user_id', scopeUserIds)
        const { count: ahead } = await aheadQ
        myEntry = {
          ...m, is_me: true,
          rank:                (ahead ?? 0) + 1,
          first_name:          profileMap[user.id]?.first_name  ?? null,
          avatar_url:          profileMap[user.id]?.avatar_url  ?? null,
          comp_name:           compNameMap[user.id]             ?? null,
          tribe_id:            tribeInfoMap[user.id]?.tribe_id   ?? null,
          tribe_name:          tribeInfoMap[user.id]?.tribe_name ?? null,
          round_breakdown:     breakdownMap[user.id]         ?? {},
          standard_breakdown:  standardBreakdownMap[user.id] ?? {},
          bonus_breakdown:     bonusBreakdownMap[user.id]    ?? {},
          tab_breakdown:       tabBreakdownMap[user.id]      ?? {},
          tab_bonus_breakdown: tabBonusMap[user.id]          ?? {},
        }
      }
    }

    if (myEntry) {
      myEntry = { ...myEntry, prev_round_rank: prevRoundRank, prev_round_tab: prevRoundTab }
    }

    return NextResponse.json({ data: ranked, my_entry: myEntry, total: rows.length })

  } catch (err: any) {
    console.error('Leaderboard error:', {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    })
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
