import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Tracked redirect for the Round Debrief card link: logs a click
// (source='debrief_<surface>') into report_link_clicks, then forwards to the
// members-only debrief page (which enforces its own auth/membership). Logging
// never blocks the redirect.
export async function GET(request: NextRequest) {
  const url     = new URL(request.url)
  const tribeId = url.searchParams.get('tribe_id')
  const round   = url.searchParams.get('round')
  const source  = url.searchParams.get('source') || 'debrief'

  try {
    const user  = await getSessionUser().catch(() => null)
    const admin = createAdminClient()
    await (admin.from('report_link_clicks') as any).insert({
      tribe_id: tribeId || null,
      user_id:  user?.id ?? null,
      source,
    })
  } catch { /* never block the redirect on a logging failure */ }

  const dest = new URL(`${url.origin}/tribe/round-debrief`)
  if (tribeId) dest.searchParams.set('tribe_id', tribeId)
  if (round)   dest.searchParams.set('round', round)
  return NextResponse.redirect(dest)
}
