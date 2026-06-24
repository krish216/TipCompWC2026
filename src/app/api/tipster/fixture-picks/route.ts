import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/tipster/fixture-picks?fixture_id=&scope=comp|tribe&id=<compOrTribeId>
// Who in your comp / tribe picked each outcome for a SETTLED fixture. Membership-gated;
// mock accounts excluded. Only revealed once the result is in (By-round shows settled only).
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const fixtureId = parseInt(url.searchParams.get('fixture_id') ?? '')
  const scope = url.searchParams.get('scope')
  const id = url.searchParams.get('id')
  if (!fixtureId || !id || (scope !== 'comp' && scope !== 'tribe'))
    return NextResponse.json({ error: 'fixture_id, scope (comp|tribe) and id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: fx } = await (admin.from('fixtures') as any)
    .select('id, home, away, home_score, away_score, tournament_id').eq('id', fixtureId).maybeSingle()
  if (!fx) return NextResponse.json({ error: 'Fixture not found' }, { status: 404 })
  if ((fx as any).home_score == null) return NextResponse.json({ fixture: { home: fx.home, away: fx.away }, picks: [] })

  // Membership gate + member list.
  const table = scope === 'comp' ? 'user_comps' : 'tribe_members'
  const col   = scope === 'comp' ? 'comp_id' : 'tribe_id'
  const { data: mine } = await (admin.from(table) as any).select('user_id').eq(col, id).eq('user_id', user.id).maybeSingle()
  if (!mine) return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  const { data: members } = await (admin.from(table) as any).select('user_id').eq(col, id)

  const { data: mock } = await (admin.from('users') as any).select('id').like('email', '%@tribepicks.dev')
  const mockSet = new Set(((mock ?? []) as any[]).map(u => u.id))
  const memberIds = ((members ?? []) as any[]).map(m => m.user_id).filter((x: string) => !mockSet.has(x))
  if (!memberIds.length) return NextResponse.json({ fixture: { home: fx.home, away: fx.away }, picks: [] })

  const { data: preds } = await (admin.from('predictions') as any)
    .select('user_id, home, away, outcome').eq('fixture_id', fixtureId).in('user_id', memberIds)
  const predUserIds = ((preds ?? []) as any[]).map(p => p.user_id)
  const { data: users } = predUserIds.length
    ? await (admin.from('users') as any).select('id, display_name, avatar_url').in('id', predUserIds)
    : { data: [] }
  const userById = new Map(((users ?? []) as any[]).map(u => [u.id, u]))

  // Leaderboard ranks — global (whole tournament) + within this comp/tribe.
  const lb: any[] = []
  for (let from = 0; from < 50000; from += 1000) {
    const { data } = await (admin.from('leaderboard') as any)
      .select('user_id, total_points').eq('tournament_id', (fx as any).tournament_id)
      .order('total_points', { ascending: false }).range(from, from + 999)
    const rows = (data ?? []) as any[]
    lb.push(...rows)
    if (rows.length < 1000) break
  }
  const globalRank = new Map<string, number>(), pts = new Map<string, number>()
  lb.forEach((r, i) => { globalRank.set(r.user_id, i + 1); pts.set(r.user_id, r.total_points) })
  const memberSet = new Set(memberIds)
  const groupRank = new Map<string, number>()
  lb.filter(r => memberSet.has(r.user_id)).forEach((r, i) => groupRank.set(r.user_id, i + 1))

  const hs = (fx as any).home_score, as = (fx as any).away_score
  const result = as == null ? null : hs > as ? 'H' : hs < as ? 'A' : 'D'

  const picks = ((preds ?? []) as any[]).map(p => {
    const u = userById.get(p.user_id)
    const outcome = (p.outcome as 'H' | 'D' | 'A' | null) ?? (p.home > p.away ? 'H' : p.home < p.away ? 'A' : 'D')
    return {
      name: u?.display_name ?? 'Player', avatar_url: u?.avatar_url ?? null,
      outcome, is_me: p.user_id === user.id,
      points: pts.get(p.user_id) ?? 0,
      globalRank: globalRank.get(p.user_id) ?? null,
      groupRank: groupRank.get(p.user_id) ?? null,
    }
  }).sort((a, b) => (b.is_me ? 1 : 0) - (a.is_me ? 1 : 0) || (a.globalRank ?? 1e9) - (b.globalRank ?? 1e9))

  return NextResponse.json({ fixture: { home: fx.home, away: fx.away }, result, scope, picks })
}
