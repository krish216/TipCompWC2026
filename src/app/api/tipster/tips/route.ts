import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { computeTipReview } from '@/lib/tipster-tips'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/tipster/tips?tournament_id=&comp_id=&tribe_id=
// Tipster Pro — fixture-by-fixture "Tip Review". Same paid gate as the summary
// (is_ad_free || is_premium). comp_id/tribe_id are optional comparison populations.
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
    const isPro = !!(ut?.is_premium || ut?.is_ad_free)

    const review = await computeTipReview(admin, user.id, tournamentId, compId, tribeId)
    if (!isPro) {
      // Taste: just the FIRST fixture of the latest round (one round, one game).
      const last = review.rounds[review.rounds.length - 1]
      const rounds = last ? [{ ...last, fixtures: last.fixtures.slice(0, 1) }] : []
      return NextResponse.json({ pro: false, rounds, multiTribe: review.multiTribe })
    }
    return NextResponse.json({ pro: true, ...review })
  } catch (err: any) {
    console.error('[tipster/tips]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
