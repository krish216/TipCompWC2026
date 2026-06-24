import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { listRivals, computeH2H } from '@/lib/tipster-h2h'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/tipster/h2h?tournament_id=&tribe_id=[&rival_id=]
// Tipster Pro — head-to-head vs a tribe rival. Without rival_id: the candidate list
// (tribe-mates). With rival_id: the full comparison (rival must share the tribe).
export async function GET(request: NextRequest) {
  try {
    createServerSupabaseClient()
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const tournamentId = url.searchParams.get('tournament_id')
    const tribeId = url.searchParams.get('tribe_id') || null
    const rivalId = url.searchParams.get('rival_id') || null
    if (!tournamentId) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

    const admin = createAdminClient()
    const { data: ut } = await (admin.from('user_tournaments') as any)
      .select('is_premium, is_ad_free')
      .eq('user_id', user.id).eq('tournament_id', tournamentId).maybeSingle()
    if (!(ut?.is_premium || ut?.is_ad_free)) return NextResponse.json({ pro: false })

    if (!tribeId) return NextResponse.json({ pro: true, rivals: [], myPoints: 0 })

    // Caller must be in the tribe.
    const { data: mine } = await (admin.from('tribe_members') as any)
      .select('user_id').eq('tribe_id', tribeId).eq('user_id', user.id).maybeSingle()
    if (!mine) return NextResponse.json({ error: 'Not a member of this tribe' }, { status: 403 })

    const { rivals, myPoints } = await listRivals(admin, user.id, tribeId, tournamentId)

    if (!rivalId) return NextResponse.json({ pro: true, rivals, myPoints })

    // Gate: rival must be one of the tribe-mates.
    if (!rivals.some(r => r.id === rivalId)) return NextResponse.json({ error: 'Rival not in your tribe' }, { status: 403 })
    const h2h = await computeH2H(admin, user.id, rivalId, tournamentId)
    return NextResponse.json({ pro: true, rivals, myPoints, h2h })
  } catch (err: any) {
    console.error('[tipster/h2h]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
