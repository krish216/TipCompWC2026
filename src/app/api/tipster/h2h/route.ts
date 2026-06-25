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
    const isPro = !!(ut?.is_premium || ut?.is_ad_free)

    if (!tribeId) return NextResponse.json({ pro: isPro, rivals: [], myPoints: 0 })

    // Caller must be in the tribe.
    const { data: mine } = await (admin.from('tribe_members') as any)
      .select('user_id').eq('tribe_id', tribeId).eq('user_id', user.id).maybeSingle()
    if (!mine) return NextResponse.json({ error: 'Not a member of this tribe' }, { status: 403 })

    const { rivals, myPoints } = await listRivals(admin, user.id, tribeId, tournamentId)
    // Free users only get a single, fixed rival: the LOWEST-ranked tribe-mate
    // (rivals are sorted points-desc, so the last one). No picker, no real intel.
    const free = isPro ? rivals : (rivals.length ? [rivals[rivals.length - 1]] : [])

    // Free: ignore any requested rival; force the lowest-ranked.
    const target = isPro ? rivalId : (free[0]?.id ?? null)
    if (!target) return NextResponse.json({ pro: isPro, rivals: free, myPoints })

    // Gate: rival must be one of the (allowed) tribe-mates.
    const allowed = isPro ? rivals : free
    if (!allowed.some(r => r.id === target)) return NextResponse.json({ error: 'Rival not allowed' }, { status: 403 })
    const h2h = await computeH2H(admin, user.id, target, tournamentId)
    return NextResponse.json({ pro: isPro, rivals: free, myPoints, h2h })
  } catch (err: any) {
    console.error('[tipster/h2h]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
