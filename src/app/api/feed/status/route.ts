import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/feed/status — the signed-in user's feeding state for client surfaces (the predict
// nudge). luckyDog = the doggie from their most recent feed ("rooting for you this round");
// met = distinct dogs they've fed (collect the pack). Tolerant of the donations/dog_slug column.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ signedIn: false })

  const admin = createAdminClient()
  let fedCents = 0, luckyDog: string | null = null
  const met: string[] = []
  try {
    const { data } = await (admin.from('donations') as any)
      .select('amount_cents, dog_slug, created_at').eq('user_id', user.id)
      .order('created_at', { ascending: false })
    const seen = new Set<string>()
    for (const r of ((data ?? []) as any[])) {
      fedCents += r.amount_cents ?? 0
      if (r.dog_slug) {
        if (!luckyDog) luckyDog = r.dog_slug   // rows are newest-first → first with a dog wins
        if (!seen.has(r.dog_slug)) { seen.add(r.dog_slug); met.push(r.dog_slug) }
      }
    }
  } catch { /* donations table absent → empty state */ }

  return NextResponse.json({ signedIn: true, fedCents, luckyDog, met })
}
