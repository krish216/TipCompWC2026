import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Tracked redirect for the report link posted in tribe chat: logs a "report
// opened" event (source='chat_report'), then forwards to the members-only report
// page (which enforces its own auth/membership). Logging never blocks the redirect.
export async function GET(request: NextRequest) {
  const url     = new URL(request.url)
  const tribeId = url.searchParams.get('tribe_id')

  try {
    const user  = await getSessionUser().catch(() => null)
    const admin = createAdminClient()
    await (admin.from('report_link_clicks') as any).insert({
      tribe_id: tribeId || null,
      user_id:  user?.id ?? null,
      source:   'chat_report',
    })
  } catch { /* never block the redirect on a logging failure */ }

  return NextResponse.redirect(tribeId ? `${url.origin}/tribe/report?tribe_id=${tribeId}` : `${url.origin}/tribe/report`)
}
