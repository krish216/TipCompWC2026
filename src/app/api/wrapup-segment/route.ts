import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Knockout round codes for WC2026 — reaching any of these = "finisher" (mirrors
// scripts/export-wrapup-segments.js, the email segmentation).
const KNOCKOUT = new Set(['r32', 'r16', 'qf', 'sf', 'tp', 'f'])

// GET /api/wrapup-segment — for the signed-in user, is the wrap-up survey live, and which
// segment are they? Lets the homepage banner route them to their full poll set:
//   finisher → /polls?topic=wrapup-finish,wrapup-general
//   drifter  → /polls?topic=wrapup-drift,wrapup-general
// segment is null if they never made a real WC pick (not part of this survey).
export async function GET() {
  const user = await getSessionUser().catch(() => null)
  if (!user) return NextResponse.json({ active: false, segment: null })
  const admin = createAdminClient()

  // Only surface anything while the survey is actually active.
  const { data: livePoll } = await (admin.from('polls') as any)
    .select('id').like('topic', 'wrapup-%').eq('active', true).limit(1).maybeSingle()
  if (!livePoll) return NextResponse.json({ active: false, segment: null })

  const { data: wc } = await (admin.from('tournaments') as any).select('id').eq('slug', 'wc2026').maybeSingle()
  if (!wc?.id) return NextResponse.json({ active: true, segment: null })

  // fixture_id → round (excluding the warm-up round, which isn't a real comp pick).
  const { data: fx } = await (admin.from('fixtures') as any).select('id, round').eq('tournament_id', wc.id)
  const roundByFixture = new Map<number, string>()
  for (const f of (fx ?? []) as any[]) if (f.round !== 'wup') roundByFixture.set(f.id, f.round)

  const { data: preds } = await (admin.from('predictions') as any)
    .select('fixture_id').eq('tournament_id', wc.id).eq('user_id', user.id)

  let tippedReal = false, finisher = false
  for (const p of (preds ?? []) as any[]) {
    const r = roundByFixture.get(p.fixture_id)
    if (!r) continue
    tippedReal = true
    if (KNOCKOUT.has(r)) finisher = true
  }

  const segment = !tippedReal ? null : finisher ? 'finisher' : 'drifter'
  return NextResponse.json({ active: true, segment })
}
