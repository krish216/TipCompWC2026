import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'
import { ChallengeType } from '@/lib/sponsors/types'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/sponsors/active?challenge=bracket[&tournament=…]  (PUBLIC)
// Returns the live ResolvedSponsorConfig for the challenge — the single read the
// bracket header + insert use. Auto on/off via the campaign's [starts_at, ends_at].
export async function GET(request: NextRequest) {
  const admin = createAdminClient()
  const sp = new URL(request.url).searchParams
  const challengeType = (sp.get('challenge') === 'four_pick' ? 'four_pick' : 'bracket') as ChallengeType
  const tournamentId  = sp.get('tournament')
  const cfg = await resolveActiveCampaign(admin, { challengeType, tournamentId })
  return NextResponse.json(cfg)
}
