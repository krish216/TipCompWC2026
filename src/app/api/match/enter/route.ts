import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { enterMatchChallenge } from '@/lib/match/enter'
import { sendMatchEntryConfirmation } from '@/lib/match/entry-confirmation'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// POST /api/match/enter — a signed-in player predicts the match. Guests use
// /api/match/guest-enter (email-code account creation). Idempotent per user.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Sign in to enter.' }, { status: 401 })

  const body  = await request.json().catch(() => ({}))
  const admin = createAdminClient()
  const r = await enterMatchChallenge(admin, { body, userId: user.id, source: 'member' })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })

  // One-time confirmation email on a first entry (never on edits). Fire-and-forget.
  if (r.created && r.challenge) {
    const { data: u } = await (admin.from('users') as any).select('email, display_name, first_name').eq('id', user.id).maybeSingle()
    const email = (u as any)?.email
    if (email) {
      sendMatchEntryConfirmation(admin, {
        email, name: (u as any)?.display_name || (u as any)?.first_name || null,
        userId: user.id, slug: r.challenge.slug, origin: new URL(request.url).origin,
      }).catch(() => {})
    }
  }

  const line = r.hasPrize ? 'You’re in the draw! 🎉' : 'Prediction locked in! ✅'
  return NextResponse.json({ ok: true, redirect: r.redirect, message: line })
}
