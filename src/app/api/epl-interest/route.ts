import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/epl-interest?v=yes|maybe|no&u=<chiefId>
// One-click EPL interest vote from the Comp-Chief email — works with no login, so it
// reaches lapsed Chiefs in their inbox. Records the vote (upsert, one per Chief) and
// redirects to the thank-you page, which lets them change it (correcting any phantom
// click from an email link-scanner). Tolerant: if the table isn't applied yet the vote
// is skipped but the thank-you still shows.
const VALID = new Set(['yes', 'maybe', 'no'])

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const v = (searchParams.get('v') || '').toLowerCase()
  const u = searchParams.get('u') || ''
  const s = (searchParams.get('s') || '').toLowerCase()   // campaign channel: 'tipster' | 'chief'

  if (VALID.has(v) && u) {
    try {
      const admin = createAdminClient()
      // Always record the vote (the core signal) — kept tolerant of the source column (169)
      // not being applied yet.
      await (admin.from('epl_interest') as any).upsert(
        { user_id: u, response: v, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      // Best-effort channel tag — which campaign drove this response.
      if (s === 'tipster' || s === 'chief') {
        try { await (admin.from('epl_interest') as any).update({ source: s }).eq('user_id', u) } catch { /* column not applied yet */ }
      }
    } catch { /* missing table / bad id → skip; still confirm to the user */ }
  }

  const dest = new URL('/epl-interest', request.url)
  if (VALID.has(v)) dest.searchParams.set('v', v)
  if (u) dest.searchParams.set('u', u)
  return NextResponse.redirect(dest)
}
