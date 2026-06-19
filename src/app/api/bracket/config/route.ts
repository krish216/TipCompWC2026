import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveActiveCampaign } from '@/lib/sponsors/resolver'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Bracket Challenge co-branding (read-only). Resolves the active sponsor campaign
// for a challenge from the Sponsor Campaigns module; no campaign → no sponsor
// (EMPTY), so the header/insert auto on/off with the campaign window. Sponsors are
// managed in /admin/challenges (attach) + /admin/sponsors (brands).
export async function GET(request: NextRequest) {
  const admin = createAdminClient()
  // ?challenge=<slug> resolves that specific bracket challenge's sponsor; absent,
  // it resolves the tournament's default bracket challenge.
  const slug = new URL(request.url).searchParams.get('challenge')
  const cfg = await resolveActiveCampaign(admin, { challengeType: 'bracket', slug })
  return NextResponse.json(cfg)
}
