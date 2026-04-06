import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { RoundId } from '@/types'

const ROUND_ORDER: RoundId[] = ['gs','r32','r16','qf','sf','tp','f']

// GET /api/leaderboard?scope=global|tribe&limit=50&offset=0
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const scope  = searchParams.get('scope')  ?? 'global'
  const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '50'), 200)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  // Get user's org and tribe
  const { data: meRow } = await supabase
    .from('users').select('tribe_id, org_id').eq('id', user.id).single()
  const tribeId = (meRow as any)?.tribe_id ?? null
  const orgId   = (meRow as any)?.org_id   ?? null

  // For tribe scope, require tribe membership
  if (scope === 'tribe' && !tribeId) {
    return NextResponse.json({ data: [], message: 'You are not in a tribe.' })
  }

  // Get base leaderboard rows
  let query = supabase
    .from('leaderboard')
    .select('user_id, display_name, tribe_name, total_points, exact_count, correct_count, predictions_made')
    .order('total_points', { ascending: false })
    .order('exact_count',  { ascending: false })
    .range(offset, offset + limit - 1)

  if (scope === 'tribe' && tribeId) {
    // Filter to tribe members
    const { data: members } = await supabase
      .from('tribe_members').select('user_id').eq('tribe_id', tribeId)
    const memberIds = (members ?? []).map((m: any) => m.user_id)
    query = query.in('user_id', memberIds)
  } else if (scope === 'org' && orgId) {
    // Filter to org members
    const { data: orgMembers } = await supabase
      .from('users').select('id').eq('org_id', orgId)
    const memberIds = (orgMembers ?? []).map((m: any) => m.id)
    query = query.in('user_id', memberIds)
  } else if (scope === 'global') {
    // If user has an org, default global to org-scoped for privacy
    // Pass ?scope=all to get truly global
    if (orgId && searchParams.get('scope') !== 'all') {
      const { data: orgMembers } = await supabase
        .from('users').select('id').eq('org_id', orgId)
      const memberIds = (orgMembers ?? []).map((m: any) => m.id)
      if (memberIds.length > 0) query = query.in('user_id', memberIds)
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  // Build round_breakdown for each user by querying predictions + fixtures
  // Only do this for up to 50 users to keep it fast
  const userIds = rows.map((r: any) => r.user_id)

  let breakdownMap: Record<string, Record<RoundId, number>> = {}
  if (userIds.length > 0) {
    const { data: predRows } = await supabase
      .from('predictions')
      .select('user_id, points_earned, fixtures!inner(round)')
      .in('user_id', userIds)
      .not('points_earned', 'is', null)

    ;(predRows ?? []).forEach((p: any) => {
      const uid   = p.user_id
      const round = p.fixtures?.round as RoundId
      const pts   = p.points_earned ?? 0
      if (!breakdownMap[uid]) breakdownMap[uid] = {} as Record<RoundId, number>
      breakdownMap[uid][round] = (breakdownMap[uid][round] ?? 0) + pts
    })
  }

  // Add rank + round_breakdown + is_me flag
  const ranked = rows.map((row: any, i: number) => ({
    ...row,
    rank:            offset + i + 1,
    is_me:           row.user_id === user.id,
    round_breakdown: breakdownMap[row.user_id] ?? {},
  }))

  // Find current user's position if not in visible results
  let myEntry = ranked.find((r: any) => r.is_me) ?? null
  if (!myEntry && scope === 'global') {
    const { data: myRaw } = await supabase
      .from('leaderboard')
      .select('user_id, display_name, tribe_name, total_points, exact_count, correct_count, predictions_made')
      .eq('user_id', user.id)
      .single()
    if (myRaw) {
      const myRawAny = myRaw as any
      const { count: ahead } = await supabase
        .from('leaderboard')
        .select('user_id', { count: 'exact', head: true })
        .gt('total_points', myRawAny.total_points)
      myEntry = {
        ...myRawAny,
        rank:            (ahead ?? 0) + 1,
        is_me:           true,
        round_breakdown: breakdownMap[user.id] ?? {},
      }
    }
  }

  return NextResponse.json({ data: ranked, my_entry: myEntry, total: rows.length })
}
