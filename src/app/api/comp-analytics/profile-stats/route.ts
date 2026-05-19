import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// GET /api/comp-analytics/profile-stats?comp_id={id}
// Returns profile completeness % for a comp's members:
//   first_name_pct, avatar_pct, bonus_team_pct (favourite_team), plus raw counts and total
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const compId = searchParams.get('comp_id')
    if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

    const admin = createAdminClient()

    // Get comp's tournament_id alongside members — avoids separate query
    const { data: compRow } = await (admin.from('comps') as any)
      .select('tournament_id').eq('id', compId).single()
    const tournamentId: string | null = (compRow as any)?.tournament_id ?? null

    // JOIN users inline to avoid URL-length issues with large .in('id', memberIds) calls
    const { data: memberRows } = await (admin.from('user_comps') as any)
      .select('user_id, users!inner(first_name, avatar_url)')
      .eq('comp_id', compId)

    const rows = (memberRows ?? []) as any[]
    const total = rows.length

    if (!total) {
      return NextResponse.json({
        total: 0, first_name_pct: 0, avatar_pct: 0, bonus_team_pct: 0,
        first_name_count: 0, avatar_count: 0, bonus_team_count: 0,
      })
    }

    const firstNameCount = rows.filter((r: any) => r.users?.first_name?.trim()).length
    const avatarCount    = rows.filter((r: any) => r.users?.avatar_url?.trim()).length

    // favourite_team lives in user_tournaments, not users
    let bonusTeamCount = 0
    if (tournamentId) {
      const memberIds = rows.map((r: any) => r.user_id)
      // Chunk into batches of 100 to stay safely under PostgREST URL limits
      const CHUNK = 100
      let setCount = 0
      for (let i = 0; i < memberIds.length; i += CHUNK) {
        const chunk = memberIds.slice(i, i + CHUNK)
        const { data: utRows } = await (admin.from('user_tournaments') as any)
          .select('user_id, favourite_team')
          .eq('tournament_id', tournamentId)
          .in('user_id', chunk)
        setCount += (utRows ?? []).filter((r: any) => r.favourite_team?.trim()).length
      }
      bonusTeamCount = setCount
    }

    return NextResponse.json({
      total,
      first_name_pct:   Math.round(firstNameCount / total * 100),
      avatar_pct:       Math.round(avatarCount     / total * 100),
      bonus_team_pct:   Math.round(bonusTeamCount  / total * 100),
      first_name_count: firstNameCount,
      avatar_count:     avatarCount,
      bonus_team_count: bonusTeamCount,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}
