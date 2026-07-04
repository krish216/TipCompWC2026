import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/sponsors/auth'
import { defaultWindow, overlappingCampaign } from '@/lib/sponsors/campaigns'
import { challengeTypeLabel } from '@/lib/challenges/registry'
import { ChallengeType } from '@/lib/sponsors/types'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/sponsors/campaigns[?challenge_id=…] — admin: list campaigns (+ sponsor + challenge).
export async function GET(request: NextRequest) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const challengeId = new URL(request.url).searchParams.get('challenge_id')
  let q = (admin.from('sponsor_campaigns') as any)
    .select('*, sponsors(id, name, slug, logo_url, logo_tone), challenges(type, name, tournament_id)')
    .order('starts_at', { ascending: false })
  if (challengeId) q = q.eq('challenge_id', challengeId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaigns: data ?? [] })
}

// Resolve (or create) the challenge row for a (tournament, type) pair.
async function ensureChallenge(admin: any, tournamentId: string, type: ChallengeType): Promise<string | null> {
  const { data: existing } = await (admin.from('challenges') as any)
    .select('id').eq('tournament_id', tournamentId).eq('type', type)
    .order('created_at', { ascending: true }).limit(1)
  if ((existing as any)?.[0]?.id) return (existing as any)[0].id
  const name = type === 'bracket' ? 'Bracket Challenge' : type
  // challenges.slug is NOT NULL + UNIQUE; mint a stable, readable default.
  const slug = `${type}-${Date.now().toString(36)}`
  const { data } = await (admin.from('challenges') as any)
    .insert({ tournament_id: tournamentId, type, name, slug }).select('id').single()
  return (data as any)?.id ?? null
}

// POST /api/sponsors/campaigns — admin: schedule a campaign.
// Body: { sponsor_id, challenge_id? | (challenge_type + tournament_id?), prize?,
//         click_url?, logo_tone?, starts_at?, ends_at?, enabled? }
// Window defaults to [lock - 5 days, lock] when starts_at/ends_at omitted.
export async function POST(request: NextRequest) {
  const { admin, ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await request.json().catch(() => ({}))
  if (!b.sponsor_id) return NextResponse.json({ error: 'sponsor_id required' }, { status: 400 })

  // Resolve the target challenge.
  let challengeId: string | null = b.challenge_id ?? null
  let tournamentId: string | null = b.tournament_id ?? null
  const challengeType: ChallengeType = b.challenge_type === 'four_pick' ? 'four_pick' : 'bracket'
  if (!challengeId) {
    if (!tournamentId) {
      const { data: t } = await admin.from('tournaments').select('id').eq('is_active', true).maybeSingle()
      tournamentId = (t as any)?.id ?? null
    }
    if (!tournamentId) return NextResponse.json({ error: 'No active tournament; pass challenge_id or tournament_id' }, { status: 400 })
    challengeId = await ensureChallenge(admin, tournamentId, challengeType)
  } else {
    const { data: ch } = await (admin.from('challenges') as any).select('tournament_id').eq('id', challengeId).maybeSingle()
    tournamentId = (ch as any)?.tournament_id ?? null
  }
  if (!challengeId) return NextResponse.json({ error: 'Could not resolve challenge' }, { status: 400 })

  // ── Sponsor ↔ challenge model guards ────────────────────────────────────────
  const { data: chRow } = await (admin.from('challenges') as any).select('type').eq('id', challengeId).maybeSingle()
  const chType = (chRow as any)?.type ?? challengeType

  // (a) One challenge has one sponsor — existing campaigns on it must match.
  const { data: onChallenge } = await (admin.from('sponsor_campaigns') as any)
    .select('sponsor_id, sponsors(name)').eq('challenge_id', challengeId)
  const otherSponsor = ((onChallenge ?? []) as any[]).find(c => c.sponsor_id !== b.sponsor_id)
  if (otherSponsor)
    return NextResponse.json({ error: `This challenge already belongs to ${otherSponsor.sponsors?.name ?? 'another sponsor'} — a challenge has one sponsor.` }, { status: 409 })

  // (b) A sponsor runs one challenge per type — extra promotions are campaigns on
  //     the existing one, not a second same-type challenge. EXCEPTION: match
  //     challenges are per-fixture, so a sponsor can back many (one per match).
  if (chType !== 'match') {
    const { data: sponsorCamps } = await (admin.from('sponsor_campaigns') as any)
      .select('challenge_id, challenges(type)').eq('sponsor_id', b.sponsor_id)
    const typeClash = ((sponsorCamps ?? []) as any[]).find(c => c.challenges?.type === chType && c.challenge_id !== challengeId)
    if (typeClash)
      return NextResponse.json({ error: `This sponsor already runs a ${challengeTypeLabel(chType)} challenge — add a campaign to that one instead.` }, { status: 409 })
  }

  // Default the window when not supplied.
  let starts_at: string | null = b.starts_at ?? null
  let ends_at:   string | null = b.ends_at   ?? null
  if ((!starts_at || !ends_at) && tournamentId) {
    const w = await defaultWindow(admin, tournamentId, challengeType)
    starts_at = starts_at ?? w.starts_at
    ends_at   = ends_at   ?? w.ends_at
  }
  if (!starts_at || !ends_at)
    return NextResponse.json({ error: 'Set a start and end date for the campaign.' }, { status: 422 })

  // One live sponsor at a time: reject a window that overlaps another campaign
  // on this challenge.
  const clash = await overlappingCampaign(admin, challengeId, starts_at, ends_at)
  if (clash) return NextResponse.json({ error: `This challenge already has a campaign (${clash.name}) overlapping that window. Campaigns can’t overlap.` }, { status: 409 })

  const now = new Date().toISOString()
  const { data, error } = await (admin.from('sponsor_campaigns') as any).insert({
    sponsor_id:   b.sponsor_id,
    challenge_id: challengeId,
    prize:        b.prize?.trim()     || null,
    prize_1:      b.prize_1?.trim()   || null,
    prize_2:      b.prize_2?.trim()   || null,
    prize_3:      b.prize_3?.trim()   || null,
    click_url:    b.click_url?.trim() || null,
    logo_tone:    b.logo_tone === 'light' ? 'light' : (b.logo_tone === 'dark' ? 'dark' : null),
    starts_at,
    ends_at,
    enabled:      b.enabled !== false,
    created_at:   now,
    updated_at:   now,
  }).select('*, sponsors(id, name, slug), challenges(type, name, tournament_id)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data })
}
