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
  // Include the challenge name so a targeted (incl. invite-only) builder/entry modal
  // can label it — invite-only challenges aren't in the public challenges list.
  let challenge_name: string | null = null
  if (slug) {
    const { data: ch } = await (admin.from('challenges') as any).select('name').eq('slug', slug).maybeSingle()
    challenge_name = (ch as any)?.name ?? null
  }
  return NextResponse.json({ ...cfg, challenge_name })
}
