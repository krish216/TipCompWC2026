import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// In-app EPL poll for the authenticated user — the mop-up channel for people who didn't click
// the email links. Session-based (no trusted `u` param); tagged source='app' so the tally
// separates in-app pull from the chief/tipster email pull.
const VALID = new Set(['yes', 'maybe', 'no'])

// GET → has the signed-in user already responded (via any channel)? Drives whether the banner
// shows at all.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ responded: false, anon: true })
  const admin = createAdminClient()
  const { data } = await (admin.from('epl_interest') as any)
    .select('response').eq('user_id', user.id).maybeSingle()
  return NextResponse.json({ responded: !!data, response: (data as any)?.response ?? null })
}

// POST { response } → record the in-app vote for the signed-in user.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const response = (body?.response || '').toLowerCase()
  if (!VALID.has(response)) return NextResponse.json({ error: 'Invalid response' }, { status: 422 })

  const admin = createAdminClient()
  try {
    // Record the vote (core), then best-effort channel tag — tolerant of the source column
    // (migration 169) not existing.
    await (admin.from('epl_interest') as any).upsert(
      { user_id: user.id, response, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    try { await (admin.from('epl_interest') as any).update({ source: 'app' }).eq('user_id', user.id) } catch { /* column not applied */ }
  } catch {
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
