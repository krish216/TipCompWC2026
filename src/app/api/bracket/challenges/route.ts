import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/sponsors/auth'
import { toSlug } from '@/lib/sponsors/campaigns'
import { listBracketChallenges } from '@/lib/bracket/challenge'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

async function activeTournamentId(admin: any): Promise<string | null> {
  const { data } = await admin.from('tournaments').select('id').eq('is_active', true).maybeSingle()
  return (data as any)?.id ?? null
}

async function entrantCount(admin: any, challengeId: string): Promise<number> {
  const { count } = await (admin.from('bracket_entries') as any)
    .select('id', { count: 'exact', head: true }).eq('challenge_id', challengeId)
  return count ?? 0
}

function sponsorSummary(cfg: any) {
  return cfg.enabled
    ? { name: cfg.sponsor_name, logo: cfg.sponsor_logo, prize: cfg.prize, url: cfg.sponsor_url, logo_tone: cfg.logo_tone }
    : null
}

// GET /api/bracket/challenges
//   default (public)  — enabled bracket challenges for the tournament, each with
//                       its active sponsor + entrant count (powers choosers).
//   ?manage=1 (admin) — ALL bracket challenges incl. disabled, with id + enabled,
//                       for the admin Challenges page.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const tournamentId = url.searchParams.get('tournament_id')

  if (url.searchParams.get('manage')) {
    const { admin, ok } = await requireAdmin()
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const tid = tournamentId ?? (await activeTournamentId(admin))
    if (!tid) return NextResponse.json({ challenges: [] })

    const { data: rows } = await (admin.from('challenges') as any)
      .select('id, slug, name, enabled, type, created_at')
      .eq('tournament_id', tid).eq('type', 'bracket')
      .order('created_at', { ascending: true })

    const challenges = await Promise.all(((rows ?? []) as any[]).map(async ch => {
      const [entrants, cfg] = await Promise.all([
        entrantCount(admin, ch.id),
        resolveActiveCampaign(admin, { challengeType: 'bracket', challengeId: ch.id }),
      ])
      return { id: ch.id, slug: ch.slug, name: ch.name, enabled: ch.enabled, entrants, sponsor: sponsorSummary(cfg) }
    }))
    return NextResponse.json({ challenges, tournament_id: tid })
  }

  // ── public list ──
  const admin = createAdminClient()
  const list  = await listBracketChallenges(admin, { tournamentId })
  const challenges = await Promise.all(list.map(async ch => {
    const [entrants, cfg] = await Promise.all([
      entrantCount(admin, ch.id),
      resolveActiveCampaign(admin, { challengeType: 'bracket', challengeId: ch.id }),
    ])
    return { slug: ch.slug, name: ch.name, entrants, sponsor: sponsorSummary(cfg) }
  }))
  return NextResponse.json({ challenges })
}

// POST /api/bracket/challenges — admin: create a bracket challenge.
// Body: { name, slug?, tournament_id?, enabled? }. Slug is uniquified on collision.
export async function POST(request: NextRequest) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await request.json().catch(() => ({}))
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const tid = (typeof b.tournament_id === 'string' && b.tournament_id) || await activeTournamentId(admin)
  if (!tid) return NextResponse.json({ error: 'No active tournament' }, { status: 400 })

  // Unique slug: base from the provided slug (or name), then -2, -3, … on clash.
  const base = toSlug(typeof b.slug === 'string' && b.slug.trim() ? b.slug : name)
  let slug = base
  for (let n = 2; n < 100; n++) {
    const { data: clash } = await (admin.from('challenges') as any).select('id').eq('slug', slug).maybeSingle()
    if (!clash) break
    slug = `${base}-${n}`
  }

  const { data, error } = await (admin.from('challenges') as any).insert({
    tournament_id: tid,
    type:          'bracket',
    name,
    slug,
    enabled:       b.enabled !== false,
  }).select('id, slug, name, enabled').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ challenge: data })
}
