import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveCompChiefs } from '@/lib/comp-chief'

export const dynamic = 'force-dynamic'

// GET /api/comps/explore — public list of open + discoverable comps
export async function GET() {
  const adminClient = createAdminClient()

  const { data: comps, error } = await (adminClient.from('comps') as any)
    .select('id, name, slug, description, comp_category, team_affiliation, prize_type, prize_description, member_cap, logo_url, created_by, owner_name, tournament:tournaments(name, logo_url), user_comps(count)')
    .eq('visibility', 'open')
    .eq('is_discoverable', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // One users query resolves every Chief so a prospective member can see who runs it.
  const chiefs = await resolveCompChiefs(adminClient, (comps ?? []) as any[])

  const data = (comps ?? []).map((c: any) => ({
    id:               c.id,
    name:             c.name,
    slug:             c.slug,
    description:      c.description ?? null,
    comp_category:    c.comp_category ?? null,
    team_affiliation: c.team_affiliation ?? null,
    prize_type:       c.prize_type ?? 'none',
    prize_description: c.prize_description ?? null,
    member_cap:       c.member_cap ?? null,
    logo_url:         c.logo_url ?? null,
    member_count:     c.user_comps?.[0]?.count ?? 0,
    tournament:       c.tournament?.name ?? null,
    tournament_logo:  c.tournament?.logo_url ?? null,
    chief:            chiefs.get(c.id) ?? null,
  }))

  return NextResponse.json({ data })
}
