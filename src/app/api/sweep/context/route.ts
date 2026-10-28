import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const DEFAULT_SLUG = 'melbourne-cup-2026'

// GET /api/sweep/context?comp_id=|?code= — bootstrap for the /sweep page: the tournament
// itself (now resolvable via a specific comp, not just the one hardcoded Melbourne Cup
// tournament — see /api/sweep/offerings for browsing across comps), plus — if logged in —
// the caller's existing tribe/pool, if they've already joined one. With neither param,
// falls back to the original hardcoded slug so the existing bookmarked /sweep page and
// rules-page links keep working unchanged.
export async function GET(request: NextRequest) {
  const admin = createAdminClient()
  const url = new URL(request.url)
  const compId = url.searchParams.get('comp_id')
  const code = url.searchParams.get('code')

  let tournament: any = null
  let scopedCompId: string | null = null
  let scopedComp: { id: string; name: string; invite_code: string } | null = null

  if (compId || code) {
    const base = (admin.from('comps') as any).select('id, name, invite_code, tournament_id')
    const { data: comp } = compId
      ? await base.eq('id', compId).maybeSingle()
      : await base.eq('invite_code', (code as string).toUpperCase()).maybeSingle()
    if (!comp) return NextResponse.json({ tournament: null, my_tribe: null })
    scopedCompId = (comp as any).id
    scopedComp = { id: (comp as any).id, name: (comp as any).name, invite_code: (comp as any).invite_code }
    const { data: tourn } = await (admin.from('tournaments') as any)
      .select('id, name, race_date:end_date, format, race_start_at, enrollment_open').eq('id', (comp as any).tournament_id).maybeSingle()
    if ((tourn as any)?.format !== 'sweep') return NextResponse.json({ tournament: null, my_tribe: null })
    tournament = tourn
  } else {
    const { data: tourn } = await (admin.from('tournaments') as any)
      .select('id, name, race_date:end_date, format, race_start_at, enrollment_open').eq('slug', DEFAULT_SLUG).maybeSingle()
    tournament = tourn
  }
  if (!tournament) return NextResponse.json({ tournament: null, my_tribe: null })

  const user = await getSessionUser()
  if (!user) return NextResponse.json({ tournament, my_tribe: null, comp: scopedComp })

  let tribeQuery = (admin.from('tribes') as any)
    .select('id, name, invite_code, comp_id, comps(name, invite_code)')
    .eq('tournament_id', (tournament as any).id)
  if (scopedCompId) tribeQuery = tribeQuery.eq('comp_id', scopedCompId)
  const { data: tribeRows } = await tribeQuery
  const tribeIds = (tribeRows ?? []).map((t: any) => t.id)
  if (tribeIds.length === 0) return NextResponse.json({ tournament, my_tribe: null, comp: scopedComp })

  const { data: membership } = await (admin.from('tribe_members') as any)
    .select('tribe_id').eq('user_id', user.id).in('tribe_id', tribeIds).limit(1).maybeSingle()
  if (!membership) return NextResponse.json({ tournament, my_tribe: null, comp: scopedComp })

  const tribe = (tribeRows as any[]).find(t => t.id === (membership as any).tribe_id)
  const { data: isAdmin } = await (admin.from('comp_admins') as any)
    .select('user_id').eq('comp_id', tribe.comp_id).eq('user_id', user.id).maybeSingle()

  return NextResponse.json({
    tournament,
    my_tribe: {
      id:               tribe.id,
      name:             tribe.name,
      invite_code:      tribe.invite_code,
      comp_id:          tribe.comp_id,
      comp_name:        tribe.comps?.name ?? null,
      comp_invite_code: tribe.comps?.invite_code ?? null,
      is_comp_admin:    !!isAdmin,
    },
  })
}
