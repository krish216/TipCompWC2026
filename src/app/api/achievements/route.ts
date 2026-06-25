import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { computeAchievements } from '@/lib/achievements'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/achievements?tournament_id=&tribe_id=
// Medals & badges — FREE (auth only, not Pro-gated). Engagement layer.
export async function GET(request: NextRequest) {
  try {
    createServerSupabaseClient()
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const tournamentId = url.searchParams.get('tournament_id')
    const tribeId = url.searchParams.get('tribe_id') || null
    if (!tournamentId) return NextResponse.json({ error: 'tournament_id required' }, { status: 400 })

    const admin = createAdminClient()
    const data = await computeAchievements(admin, user.id, tournamentId, tribeId)
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[achievements]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
