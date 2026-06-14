import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Tracked redirect: logs a click on the "open chat" funnel link, then sends the
// user to their tribe chat. Logging never blocks the redirect.
export async function GET(request: NextRequest) {
  const url     = new URL(request.url)
  const tribeId = url.searchParams.get('tribe_id')

  try {
    const user  = await getSessionUser().catch(() => null)
    const admin = createAdminClient()
    await (admin.from('report_link_clicks') as any).insert({
      tribe_id: tribeId || null,
      user_id:  user?.id ?? null,
      source:   url.searchParams.get('src') || 'home_card',
    })
  } catch { /* never block the redirect on a logging failure */ }

  return NextResponse.redirect(`${url.origin}/tribe?tab=chat`)
}
