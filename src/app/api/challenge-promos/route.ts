import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const SURFACES = new Set(['home', 'scoreboard'])

// GET /api/challenge-promos?surface=home|scoreboard
// Open, enabled challenges the admin has flagged to advertise on this surface, with
// sponsor/prize + a CTA. Excludes challenges the signed-in user has already entered
// (advertise to non-entrants); guests see everything.
export async function GET(request: NextRequest) {
  const surface = new URL(request.url).searchParams.get('surface') || ''
  if (!SURFACES.has(surface)) return NextResponse.json({ promos: [] })

  const admin = createAdminClient()
  const { data: t } = await (admin.from('tournaments') as any).select('id').eq('is_active', true).maybeSingle()
  if (!t) return NextResponse.json({ promos: [] })

  const nowIso = new Date().toISOString()
  const { data: rows } = await (admin.from('challenges') as any)
    .select('id, slug, name, type, enabled, closes_at, promote_surfaces')
    .eq('tournament_id', (t as any).id).eq('enabled', true)
    .contains('promote_surfaces', [surface])
  const open = ((rows ?? []) as any[]).filter(c => !c.closes_at || c.closes_at > nowIso)
  if (!open.length) return NextResponse.json({ promos: [] })

  // Drop the ones this user has already entered.
  const entered = new Set<string>()
  const user = await getSessionUser().catch(() => null)
  if (user) {
    const ids = open.map(c => c.id)
    const [{ data: me }, { data: be }] = await Promise.all([
      (admin.from('match_entries')   as any).select('challenge_id').eq('user_id', user.id).in('challenge_id', ids),
      (admin.from('bracket_entries') as any).select('challenge_id').eq('user_id', user.id).in('challenge_id', ids),
    ])
    for (const r of [...(me ?? []), ...(be ?? [])] as any[]) entered.add(r.challenge_id)
  }

  const promos = []
  for (const c of open) {
    if (entered.has(c.id)) continue
    const cfg = await resolveActiveCampaign(admin, { challengeType: c.type, challengeId: c.id })
    promos.push({
      slug: c.slug,
      type: c.type,
      name: c.name,
      sponsor: cfg.enabled ? { name: cfg.sponsor_name, logo: cfg.sponsor_logo, prize: cfg.prize, tagline: cfg.sponsor_tagline } : null,
      href: c.type === 'match' ? `/match/${c.slug}` : `/bracket/leaderboard/${c.slug}`,
      cta:  c.type === 'match' ? 'Pick the score →' : 'Play free →',
    })
  }
  return NextResponse.json({ promos })
}
