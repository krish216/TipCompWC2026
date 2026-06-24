import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { getOutcome } from '@/types'

export const dynamic = 'force-dynamic'

// GET /api/predictions/fixture-tipsheet?fixture_id=&tribe_id=
// Mutual-lock tipsheet for a single fixture: returns the picks of tribe members
// who have ALSO locked in their prediction for this fixture. Gated so the caller
// must be a tribe member AND have locked their own prediction first.
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url       = new URL(request.url)
  const fixtureId = parseInt(url.searchParams.get('fixture_id') ?? '')
  const tribeId   = url.searchParams.get('tribe_id')
  if (!fixtureId || !tribeId) return NextResponse.json({ error: 'fixture_id and tribe_id required' }, { status: 400 })

  // Membership gate (mirrors /api/tribes/picks).
  const supabase = createServerSupabaseClient()
  const { data: membership } = await supabase
    .from('tribe_members').select('user_id').eq('tribe_id', tribeId).eq('user_id', user.id).maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Not a member of this tribe' }, { status: 403 })

  const admin = createAdminClient()

  const { data: fx } = await (admin.from('fixtures') as any)
    .select('id, round, home, away, kickoff_utc, home_score, tournament_id').eq('id', fixtureId).maybeSingle()
  if (!fx) return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })

  // When to reveal the whole tribe (no commit gate), in order:
  //   1. the RESULT is available — picks are settled (also covers the warm-up
  //      round, whose result exists regardless of kickoff, and is robust to a
  //      mis-set kickoff_utc);
  //   2. otherwise, the fixture has KICKED OFF — predictions are locked/frozen at
  //      kickoff, so they're no longer secret.
  // Failing both, it stays a mutual-lock reveal: the caller must have locked their
  // own prediction first.
  const resultAvailable = (fx as any).home_score != null
  const kickedOff       = Date.now() >= new Date((fx as any).kickoff_utc).getTime()
  const reveal          = resultAvailable || kickedOff
  if (!reveal) {
    const { data: mine } = await (admin.from('predictions') as any)
      .select('locked_at').eq('user_id', user.id).eq('fixture_id', fixtureId).maybeSingle()
    if (!(mine as any)?.locked_at)
      return NextResponse.json({ error: 'Lock in your prediction to view the tipsheet.' }, { status: 403 })
  }

  // Is this round predicted by exact score or outcome?
  const { data: tr } = await (admin.from('tournament_rounds') as any)
    .select('predict_mode').eq('tournament_id', (fx as any).tournament_id).eq('round_code', (fx as any).round).maybeSingle()
  const isExact = (tr as any)?.predict_mode === 'score'

  // Tribe members
  const { data: memberRows } = await (admin.from('tribe_members') as any)
    .select('user_id, users(id, display_name, avatar_url)').eq('tribe_id', tribeId).limit(5000)
  const members = (memberRows ?? []).map((m: any) => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users
    return { user_id: m.user_id, display_name: u?.display_name ?? 'Unknown', avatar_url: u?.avatar_url ?? null }
  })
  const memberMap = Object.fromEntries(members.map((m: any) => [m.user_id, m]))
  const memberIds = members.map((m: any) => m.user_id)

  // Mutual-lock phase: only LOCKED predictions. Revealed phase: every tribe
  // member's prediction for this fixture, locked or not.
  let predQuery = (admin.from('predictions') as any)
    .select('user_id, home, away, outcome, pen_winner, locked_at')
    .eq('fixture_id', fixtureId).in('user_id', memberIds)
  if (!reveal) predQuery = predQuery.not('locked_at', 'is', null)
  const { data: predRows } = await predQuery

  let H = 0, D = 0, A = 0
  const picks = ((predRows ?? []) as any[]).map((p: any) => {
    const out = (p.outcome as 'H' | 'D' | 'A' | null) ?? getOutcome(p.home, p.away)
    if (out === 'H') H++; else if (out === 'A') A++; else D++
    const m = memberMap[p.user_id] ?? { display_name: 'Unknown', avatar_url: null }
    return {
      user_id: p.user_id, display_name: m.display_name, avatar_url: m.avatar_url,
      home: p.home, away: p.away, outcome: out, pen_winner: p.pen_winner ?? null,
      is_me: p.user_id === user.id,
    }
  })
  picks.sort((a, b) => (b.is_me ? 1 : 0) - (a.is_me ? 1 : 0) || a.display_name.localeCompare(b.display_name))

  const locked = picks.length
  const pct = (n: number) => (locked ? Math.round((n / locked) * 100) : 0)

  // Pro gate — everyone gets the aggregate split bar; the individual "who picked
  // what" list is Tipster Pro only. Don't leak the picks to free users.
  const { data: ut } = await (admin.from('user_tournaments') as any)
    .select('is_premium, is_ad_free').eq('user_id', user.id).eq('tournament_id', (fx as any).tournament_id).maybeSingle()
  const isPro = !!((ut as any)?.is_premium || (ut as any)?.is_ad_free)

  return NextResponse.json({
    fixture: { id: (fx as any).id, round: (fx as any).round, home: (fx as any).home, away: (fx as any).away, kickoff_utc: (fx as any).kickoff_utc },
    is_exact: isExact,
    final: reveal,                  // true → showing the whole tribe (settled/locked)
    pro: isPro,
    locked_count: locked,
    total_members: members.length,
    picks: isPro ? picks : [],
    aggregate: { H, D, A, home_pct: pct(H), draw_pct: pct(D), away_pct: pct(A) },
  })
}
