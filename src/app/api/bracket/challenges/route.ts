import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { listBracketChallenges } from '@/lib/bracket/challenge'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/bracket/challenges[?tournament_id=] — the tournament's open bracket
// challenges, each with its sponsor co-branding and entrant count. Powers the
// challenge chooser on /bracket and the slug-less leaderboard. Public.
export async function GET(request: NextRequest) {
  const admin = createAdminClient()
  const tournamentId = new URL(request.url).searchParams.get('tournament_id')
  const challenges = await listBracketChallenges(admin, { tournamentId })

  const out = await Promise.all(challenges.map(async ch => {
    const [{ count }, cfg] = await Promise.all([
      (admin.from('bracket_entries') as any).select('id', { count: 'exact', head: true }).eq('challenge_id', ch.id),
      resolveActiveCampaign(admin, { challengeType: 'bracket', challengeId: ch.id }),
    ])
    return {
      slug: ch.slug,
      name: ch.name,
      entrants: count ?? 0,
      sponsor: cfg.enabled ? { name: cfg.sponsor_name, logo: cfg.sponsor_logo, prize: cfg.prize, url: cfg.sponsor_url, logo_tone: cfg.logo_tone } : null,
    }
  }))

  return NextResponse.json({ challenges: out })
}
