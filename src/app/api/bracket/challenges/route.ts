import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/sponsors/auth'
import { toSlug } from '@/lib/sponsors/campaigns'
import { listBracketChallenges } from '@/lib/bracket/challenge'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'
import { isAvailableType } from '@/lib/challenges/registry'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

async function activeTournamentId(admin: any): Promise<string | null> {
  const { data } = await admin.from('tournaments').select('id').eq('is_active', true).maybeSingle()
  return (data as any)?.id ?? null
}

async function entrantCount(admin: any, challengeId: string, type = 'bracket'): Promise<number> {
  // Match challenges keep their entries in match_entries; everything else in bracket_entries.
  const table = type === 'match' ? 'match_entries' : 'bracket_entries'
  const { count } = await (admin.from(table) as any)
    .select('id', { count: 'exact', head: true }).eq('challenge_id', challengeId)
  return count ?? 0
}

function sponsorSummary(cfg: any) {
  return cfg.enabled
    ? { name: cfg.sponsor_name, logo: cfg.sponsor_logo, prize: cfg.prize, url: cfg.sponsor_url, logo_tone: cfg.logo_tone, tagline: cfg.sponsor_tagline }
    : null
}

// For the admin list: the challenge's most relevant enabled campaign + its
// state (live now / scheduled / ended), so "no sponsor" only shows when there
// genuinely is none — not when it's merely scheduled.
async function sponsorState(admin: any, challengeId: string): Promise<{ state: 'live' | 'scheduled' | 'ended' | 'none'; sponsor: any }> {
  const { data } = await (admin.from('sponsor_campaigns') as any)
    .select('prize, click_url, logo_tone, starts_at, ends_at, sponsors(id, name, logo_url, logo_tone, website_url)')
    .eq('challenge_id', challengeId).eq('enabled', true)
  const camps = ((data ?? []) as any[]).filter(c => c.sponsors)
  if (!camps.length) return { state: 'none', sponsor: null }
  const now = Date.now()
  const ms = (s: string | null) => (s ? new Date(s).getTime() : null)
  const live     = camps.find(c => ms(c.starts_at) != null && ms(c.ends_at) != null && ms(c.starts_at)! <= now && now <= ms(c.ends_at)!)
  const upcoming = camps.filter(c => ms(c.starts_at) != null && ms(c.starts_at)! > now).sort((a, b) => ms(a.starts_at)! - ms(b.starts_at)!)[0]
  const ended    = camps.filter(c => ms(c.ends_at)   != null && ms(c.ends_at)!   < now).sort((a, b) => ms(b.ends_at)!   - ms(a.ends_at)!)[0]
  const chosen = live || upcoming || ended
  const state: 'live' | 'scheduled' | 'ended' | 'none' = live ? 'live' : upcoming ? 'scheduled' : ended ? 'ended' : 'none'
  const sponsor = chosen ? {
    id: chosen.sponsors.id, name: chosen.sponsors.name, logo: chosen.sponsors.logo_url, prize: chosen.prize,
    url: chosen.click_url || chosen.sponsors.website_url || '',
    logo_tone: chosen.logo_tone || chosen.sponsors.logo_tone || 'dark',
    starts_at: chosen.starts_at, ends_at: chosen.ends_at,
  } : null
  return { state, sponsor }
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

    // Admin list shows bracket AND match challenges (both use challenges + sponsor_campaigns).
    const { data: rows } = await (admin.from('challenges') as any)
      .select('id, slug, name, enabled, type, access, closes_at, created_at')
      .eq('tournament_id', tid).in('type', ['bracket', 'match'])
      .order('created_at', { ascending: true })

    const challenges = await Promise.all(((rows ?? []) as any[]).map(async ch => {
      const [entrants, ss] = await Promise.all([
        entrantCount(admin, ch.id, ch.type),
        sponsorState(admin, ch.id),
      ])
      return { id: ch.id, slug: ch.slug, name: ch.name, type: ch.type, access: ch.access, closes_at: ch.closes_at ?? null, enabled: ch.enabled, entrants, sponsor: ss.sponsor, sponsor_state: ss.state }
    }))
    return NextResponse.json({ challenges, tournament_id: tid })
  }

  // ── public list (+ per-user entry status for the Bracket hub) ──
  const admin = createAdminClient()
  const user  = await getSessionUser().catch(() => null)
  const list  = await listBracketChallenges(admin, { tournamentId })
  const tid   = tournamentId ?? list[0]?.tournament_id ?? (await activeTournamentId(admin))

  // Which of these challenges the caller has entered, whether they have a
  // completed bracket (champion picked), and when entries lock (first SF KO).
  const entered = new Set<string>()
  let has_bracket = false
  let closes_at: string | null = null
  if (tid) {
    const { data: fx } = await (admin.from('fixtures') as any)
      .select('kickoff_utc').eq('tournament_id', tid).eq('round', 'sf')
      .order('kickoff_utc', { ascending: true }).limit(1)
    closes_at = (fx as any)?.[0]?.kickoff_utc ?? null
  }
  if (user && tid && list.length) {
    const [{ data: ents }, { data: champ }] = await Promise.all([
      (admin.from('bracket_entries') as any).select('challenge_id').eq('user_id', user.id).in('challenge_id', list.map(c => c.id)),
      (admin.from('bracket_picks') as any).select('team_name').eq('user_id', user.id).eq('tournament_id', tid).eq('slot_key', 'final').not('team_name', 'is', null).maybeSingle(),
    ])
    ;((ents ?? []) as any[]).forEach(e => entered.add(e.challenge_id))
    has_bracket = !!champ
  }
  const defaultClose = closes_at   // tournament-wide fallback (first SF kick-off)
  const lockedAt = (iso: string | null) => !!iso && Date.now() >= new Date(iso).getTime()

  const challenges = await Promise.all(list.map(async ch => {
    const [entrants, cfg] = await Promise.all([
      entrantCount(admin, ch.id),
      resolveActiveCampaign(admin, { challengeType: 'bracket', challengeId: ch.id }),
    ])
    const chCloses = ch.closes_at ?? defaultClose   // the challenge's own end date, else the SF default
    return { slug: ch.slug, name: ch.name, entrants, sponsor: sponsorSummary(cfg), entered: entered.has(ch.id), closes_at: chCloses, locked: lockedAt(chCloses) }
  }))
  return NextResponse.json({ challenges, logged_in: !!user, has_bracket, closes_at: defaultClose, locked: lockedAt(defaultClose) })
}

// POST /api/bracket/challenges — admin: create a bracket challenge.
// Body: { name, slug?, tournament_id?, enabled? }. Slug is uniquified on collision.
export async function POST(request: NextRequest) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await request.json().catch(() => ({}))
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const type = typeof b.type === 'string' && b.type ? b.type : 'bracket'
  if (!isAvailableType(type)) return NextResponse.json({ error: `Challenge type “${type}” isn’t available yet.` }, { status: 422 })

  const tid = (typeof b.tournament_id === 'string' && b.tournament_id) || await activeTournamentId(admin)
  if (!tid) return NextResponse.json({ error: 'No active tournament' }, { status: 400 })

  // Match challenges need a fixture; entries lock 5 min before kickoff unless an
  // explicit closes_at is given.
  const LOCK_LEAD_MS = 5 * 60 * 1000
  let fixtureId: number | null = null
  let closesAt: string | null = b.closes_at || null
  if (type === 'match') {
    fixtureId = Number(b.fixture_id)
    if (!Number.isInteger(fixtureId)) return NextResponse.json({ error: 'Pick a fixture for the match challenge.' }, { status: 422 })
    const { data: fx } = await (admin.from('fixtures') as any).select('id, kickoff_utc, tournament_id').eq('id', fixtureId).maybeSingle()
    if (!fx) return NextResponse.json({ error: 'Fixture not found.' }, { status: 422 })
    if (!closesAt && (fx as any).kickoff_utc) closesAt = new Date(new Date((fx as any).kickoff_utc).getTime() - LOCK_LEAD_MS).toISOString()
  }

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
    type,
    name,
    slug,
    enabled:       b.enabled !== false,
    access:        b.access === 'invite' ? 'invite' : 'open',
    closes_at:     closesAt,
    ...(fixtureId != null ? { fixture_id: fixtureId } : {}),
  }).select('id, slug, name, enabled, type, access, closes_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ challenge: data })
}
