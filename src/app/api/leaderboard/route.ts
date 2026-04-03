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

  // For tribe scope, get the user's tribe first
  let tribeId: string | null = null
  if (scope === 'tribe') {
    const { data: me } = await supabase.from('users').select('tribe_id').eq('id', user.id).single()
    tribeId = (me as any)?.tribe_id ?? null
    if (!tribeId) return NextResponse.json({ data: [], message: 'You are not in a tribe.' })
  }

  // Get base leaderboard rows
  let query = supabase
    .from('leaderboard')
    .select('user_id, display_name, tribe_name, total_points, exact_count, correct_count, predictions_made')
    .order('total_points', { ascending: false })
    .order('exact_count',  { ascending: false })
    .range(offset, offset + limit - 1)

  if (scope === 'tribe' && tribeId) {
    const { data: members } = await supabase.from('tribe_members').select('user_id').eq('tribe_id', tribeId)
    const memberIds = (members ?? []).map((m: any) => m.user_id)
    query = query.in('user_id', memberIds)
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
      const { count: ahead } = await supabase
        .from('leaderboard')
        .select('user_id', { count: 'exact', head: true })
        .gt('total_points', (myRaw as any).total_points)
      myEntry = {
        ...myRaw,
        rank:            (ahead ?? 0) + 1,
        is_me:           true,
        round_breakdown: breakdownMap[user.id] ?? {},
      }
    }
  }

  return NextResponse.json({ data: ranked, my_entry: myEntry, total: rows.length })
}
