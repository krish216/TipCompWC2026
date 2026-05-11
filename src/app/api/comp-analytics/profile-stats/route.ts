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

    const { data: memberRows } = await (admin.from('user_comps') as any)
      .select('user_id').eq('comp_id', compId)
    const memberIds: string[] = (memberRows ?? []).map((m: any) => m.user_id)

    if (!memberIds.length) {
      return NextResponse.json({
        total: 0, first_name_pct: 0, avatar_pct: 0, bonus_team_pct: 0,
        first_name_count: 0, avatar_count: 0, bonus_team_count: 0,
      })
    }

    const { data: userRows } = await (admin.from('users') as any)
      .select('id, first_name, avatar_url, favourite_team')
      .in('id', memberIds)

    const rows  = userRows ?? []
    const total = memberIds.length
    const firstNameCount  = rows.filter((r: any) => r.first_name?.trim()).length
    const avatarCount     = rows.filter((r: any) => r.avatar_url?.trim()).length
    const bonusTeamCount  = rows.filter((r: any) => r.favourite_team?.trim()).length

    return NextResponse.json({
      total,
      first_name_pct:   Math.round(firstNameCount  / total * 100),
      avatar_pct:       Math.round(avatarCount      / total * 100),
      bonus_team_pct:   Math.round(bonusTeamCount   / total * 100),
      first_name_count: firstNameCount,
      avatar_count:     avatarCount,
      bonus_team_count: bonusTeamCount,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}
