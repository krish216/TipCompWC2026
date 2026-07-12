import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { VERIFIED_MIN_ACTIVE } from '@/lib/comp-chief'

export const dynamic = 'force-dynamic'

// GET /api/chiefs/top?limit=8[&country=AU]
// The highest-ranked Comp-Chiefs from the nightly chief_scores view — powers the
// "Top Chiefs" prestige strip on Explore. Tolerant: returns [] if the view isn't applied
// or refreshed yet.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit   = Math.min(20, Math.max(1, parseInt(searchParams.get('limit') || '8')))
  const country = searchParams.get('country')

  const admin = createAdminClient()
  let q = (admin.from('chief_scores') as any)
    .select('chief_id, score, rank_global, rank_country, tipsters_led, active_tipsters, comps_run, seasons, country')
    .order('score', { ascending: false })
    .limit(limit)
  // Only ranked Chiefs (past the eligibility floor). Optionally scope to one country.
  q = country ? q.eq('country', country).not('rank_country', 'is', null)
              : q.not('rank_global', 'is', null)

  const { data: rows, error } = await q
  if (error || !rows?.length) return NextResponse.json({ chiefs: [] })

  const ids = (rows as any[]).map(r => r.chief_id)
  const { data: users } = await (admin.from('users') as any)
    .select('id, display_name, avatar_url, country, email_verified').in('id', ids)
  const byId = new Map<string, any>()
  for (const u of (users ?? []) as any[]) byId.set(u.id, u)

  const chiefs = (rows as any[])
    .map(r => {
      const u = byId.get(r.chief_id)
      if (!u?.display_name) return null
      return {
        id: r.chief_id, name: u.display_name, avatar_url: u.avatar_url ?? null, country: u.country ?? r.country ?? null,
        rank: country ? r.rank_country : r.rank_global,
        tipsters_led: r.tipsters_led, comps_run: r.comps_run, seasons: r.seasons,
        verified: !!u.email_verified && (r.active_tipsters ?? 0) >= VERIFIED_MIN_ACTIVE,
      }
    })
    .filter(Boolean)

  return NextResponse.json({ chiefs }, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
