import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

// GET /api/comps/explore — public list of open + discoverable comps
export async function GET() {
  const adminClient = createAdminClient()

  const { data: comps, error } = await (adminClient.from('comps') as any)
    .select('id, name, description, comp_category, team_affiliation, prize_type, prize_description, member_cap, logo_url, user_comps(count)')
    .eq('visibility', 'open')
    .eq('is_discoverable', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const data = (comps ?? []).map((c: any) => ({
    id:               c.id,
    name:             c.name,
    description:      c.description ?? null,
    comp_category:    c.comp_category ?? null,
    team_affiliation: c.team_affiliation ?? null,
    prize_type:       c.prize_type ?? 'none',
    prize_description: c.prize_description ?? null,
    member_cap:       c.member_cap ?? null,
    logo_url:         c.logo_url ?? null,
    member_count:     c.user_comps?.[0]?.count ?? 0,
  }))

  return NextResponse.json({ data })
}
