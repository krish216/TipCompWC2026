import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/comp-members/counts?comp_ids=id1,id2,...
// Returns accurate member counts from user_comps — not capped like the leaderboard (50 row limit).
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const compIds = (new URL(request.url).searchParams.get('comp_ids') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
  if (!compIds.length) return NextResponse.json({ data: {} })

  const admin = createAdminClient()

  const counts = await Promise.all(
    compIds.map(async comp_id => {
      const { count } = await (admin.from('user_comps') as any)
        .select('*', { count: 'exact', head: true })
        .eq('comp_id', comp_id)
      return { comp_id, count: count ?? 0 }
    })
  )

  const data: Record<string, number> = {}
  counts.forEach(({ comp_id, count }) => { data[comp_id] = count })

  return NextResponse.json({ data })
}
