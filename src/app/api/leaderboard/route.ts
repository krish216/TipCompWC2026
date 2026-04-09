import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { RoundId } from '@/types'

const ROUND_ORDER: RoundId[] = ['gs','r32','r16','qf','sf','tp','f']

// GET /api/leaderboard?scope=tribe|org|global&limit=50&offset=0
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const scope  = searchParams.get('scope') ?? 'org'
  // Tribe scope: no cap (tribes max 25 anyway)
  // Org/global scope: cap at 50
  const defaultLimit = scope === 'tribe' ? 25 : 50
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? String(defaultLimit)), scope === 'tribe' ? 25 : 50)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  // Get user context
  const { data: meRow } = await supabase
    .from('users').select('tribe_id, org_id').eq('id', user.id).single()
  const tribeId = (meRow as any)?.tribe_id ?? null
  const orgId   = (meRow as any)?.org_id   ?? null

  if (scope === 'tribe' && !tribeId) {
    return NextResponse.json({ data: [], my_entry: null, total: 0, message: 'You are not in a tribe yet.' })
  }

  // Build query — always include org_name and tribe_name
  let query = supabase
    .from('leaderboard')
    .select('user_id, display_name, tribe_name, tribe_id, org_name, org_id, total_points, exact_count, correct_count, predictions_made')
    .order('total_points', { ascending: false })
    .order('exact_count',  { ascending: false })
    .range(offset, offset + limit - 1)

  if (scope === 'tribe' && tribeId) {
    const { data: members } = await supabase
      .from('tribe_members').select('user_id').eq('tribe_id', tribeId)
    const ids = (members ?? []).map((m: any) => m.user_id)
    if (ids.length === 0) return NextResponse.json({ data: [], my_entry: null, total: 0 })
    query = query.in('user_id', ids)
  } else if (scope === 'org' && orgId) {
    const { data: members } = await supabase
      .from('users').select('id').eq('org_id', orgId)
    const ids = (members ?? []).map((m: any) => m.id)
    if (ids.length === 0) return NextResponse.json({ data: [], my_entry: null, total: 0 })
    query = query.in('user_id', ids)
  }
  // scope === 'global' — no filter, show everyone

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (data ?? []) as any[]

  // Build round breakdown
  const userIds = rows.map((r: any) => r.user_id)
  const breakdownMap: Record<string, Record<RoundId, number>> = {}
  if (userIds.length > 0) {
    const { data: predRows } = await supabase
      .from('predictions')
      .select('user_id, points_earned, fixtures!inner(round)')
      .in('user_id', userIds)
      .not('points_earned', 'is', null)
    ;(predRows ?? []).forEach((p: any) => {
      const uid = p.user_id; const round = p.fixtures?.round as RoundId
      if (!breakdownMap[uid]) breakdownMap[uid] = {} as Record<RoundId, number>
      breakdownMap[uid][round] = (breakdownMap[uid][round] ?? 0) + (parseInt(String(p.points_earned ?? 0)) || 0)
    })
  }

  const ranked = rows.map((row: any, i: number) => ({
    ...row,
    rank:            offset + i + 1,
    is_me:           row.user_id === user.id,
    round_breakdown: breakdownMap[row.user_id] ?? {},
  }))

  // Ensure current user always appears even if outside the page window
  let myEntry = ranked.find((r: any) => r.is_me) ?? null
  if (!myEntry) {
    const { data: myRaw } = await supabase
      .from('leaderboard')
      .select('user_id, display_name, tribe_name, tribe_id, org_name, org_id, total_points, exact_count, correct_count, predictions_made')
      .eq('user_id', user.id)
      .single()
    if (myRaw) {
      const m = myRaw as any
      const { count: ahead } = await supabase
        .from('leaderboard').select('user_id', { count: 'exact', head: true })
        .gt('total_points', m.total_points)
      myEntry = { ...m, rank: (ahead ?? 0) + 1, is_me: true, round_breakdown: breakdownMap[user.id] ?? {} }
    }
  }

  return NextResponse.json({ data: ranked, my_entry: myEntry, total: rows.length })
}
