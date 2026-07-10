import { NextResponse } from 'next/server'
import { getPrimaryTournament } from '@/lib/content/wc'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Entry deadline — first semi-final kick-off. Matches the challenges' closes_at and
// the how-it-works copy. After this, entry is closed so the prompt must disappear.
const LOCK_MS = new Date('2026-07-14T19:00:00Z').getTime()

// GET /api/bracket/entry-status
// The SINGLE source of truth for "should we nudge this user to enter the bracket
// challenge?" — used by every in-app prompt so the check can never diverge between
// surfaces (an entrant must never see a cluster of cards). Returns:
//   { entered, locked, show }  — show === (signed in AND not entered AND not locked)
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ entered: false, locked: false, show: false })

  const locked = Date.now() >= LOCK_MS

  const admin = createAdminClient()
  // Active tournament (scope the entry check to the current tournament).
  const t = await getPrimaryTournament(admin)
  const tid = (t as any)?.id ?? null

  // Air-tight "has entered": ANY bracket_entries row for this user (this tournament)
  // means they're in a challenge — every entry path (member, guest, auto_global)
  // writes here, so one row is definitive. Head count: cheap and exact.
  let q = (admin.from('bracket_entries') as any).select('id', { count: 'exact', head: true }).eq('user_id', user.id)
  if (tid) q = q.eq('tournament_id', tid)
  const { count, error } = await q
  // On a read error, fail SAFE → treat as entered (show nothing) rather than risk
  // nagging someone who has already entered.
  const entered = error ? true : (count ?? 0) > 0

  return NextResponse.json({ entered, locked, show: !entered && !locked })
}
