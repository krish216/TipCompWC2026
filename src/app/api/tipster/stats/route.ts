import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { computeTipsterStats } from '@/lib/tipster-stats'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/tipster/stats?tournament_id={uuid}
// Tipster Pro — advanced personal stats for the signed-in user.
// Gated: canSeeStats = is_ad_free || is_premium (the real paid flags, independent of
// the tournament's enforce_premium switch — stats is a paid feature regardless).
// Responses:
//   { pro: false }                                  → not paid; page shows teaser + upsell
//   { pro: true, ready: false, predictionsMade }    → paid but < min scored picks
//   { pro: true, ready: true, stats }               → paid, enough data
export async function GET(request: NextRequest) {
  try {
    createServerSupabaseClient()
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tournamentId = new URL(request.url).searchParams.get('tournament_id')
    if (!tournamentId) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

    const admin = createAdminClient()

    // Freemium: everyone gets their own stats computed; `pro` tells the UI how much
    // to reveal (free = persona + headline + trophies; deeper modules gated/blurred).
    const { data: ut } = await (admin.from('user_tournaments') as any)
      .select('is_premium, is_ad_free')
      .eq('user_id', user.id).eq('tournament_id', tournamentId).maybeSingle()
    const isPro = !!(ut?.is_premium || ut?.is_ad_free)

    const result = await computeTipsterStats(admin, user.id, tournamentId)
    if (!result.ok) {
      return NextResponse.json({ pro: isPro, ready: false, predictionsMade: result.predictionsMade })
    }
    return NextResponse.json({ pro: isPro, ready: true, stats: result.stats })
  } catch (err: any) {
    console.error('[tipster/stats]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
