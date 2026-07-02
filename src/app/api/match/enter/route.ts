import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { enterMatchChallenge } from '@/lib/match/enter'

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

  const line = r.hasPrize ? 'You’re in the draw! 🎉' : 'Prediction locked in! ✅'
  return NextResponse.json({ ok: true, redirect: r.redirect, message: line })
}
