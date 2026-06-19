import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/sponsors/auth'
import { defaultWindow } from '@/lib/sponsors/campaigns'
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

  // Default the window when not supplied.
  let starts_at: string | null = b.starts_at ?? null
  let ends_at:   string | null = b.ends_at   ?? null
  if ((!starts_at || !ends_at) && tournamentId) {
    const w = await defaultWindow(admin, tournamentId, challengeType)
    starts_at = starts_at ?? w.starts_at
    ends_at   = ends_at   ?? w.ends_at
  }

  const now = new Date().toISOString()
  const { data, error } = await (admin.from('sponsor_campaigns') as any).insert({
    sponsor_id:   b.sponsor_id,
    challenge_id: challengeId,
    prize:        b.prize?.trim()     || null,
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
