import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { computeBonusStats } from '@/lib/tipster-bonus'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/tipster/bonus?tournament_id=&comp_id=&tribe_id=
// Tipster Pro — Bonus Team card. Same paid gate as the rest of /stats.
export async function GET(request: NextRequest) {
  try {
    createServerSupabaseClient()
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const tournamentId = url.searchParams.get('tournament_id')
    const compId  = url.searchParams.get('comp_id')  || null
    const tribeId = url.searchParams.get('tribe_id') || null
    if (!tournamentId) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

    const admin = createAdminClient()
    const { data: ut } = await (admin.from('user_tournaments') as any)
      .select('is_premium, is_ad_free')
      .eq('user_id', user.id).eq('tournament_id', tournamentId).maybeSingle()
    if (!(ut?.is_premium || ut?.is_ad_free)) return NextResponse.json({ pro: false })

    const result = await computeBonusStats(admin, user.id, tournamentId, compId, tribeId)
    if (!result.ok) return NextResponse.json({ pro: true, team: null })
    return NextResponse.json({ pro: true, bonus: result.bonus })
  } catch (err: any) {
    console.error('[tipster/bonus]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
