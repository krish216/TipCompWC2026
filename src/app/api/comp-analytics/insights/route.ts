import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

async function verifyCompAdmin(admin: any, userId: string, compId: string) {
  const [{ data: ca }, { data: ta }] = await Promise.all([
    (admin.from('comp_admins') as any).select('comp_id').eq('user_id', userId).eq('comp_id', compId).single(),
    admin.from('admin_users').select('user_id').eq('user_id', userId).single(),
  ])
  return !!(ca || ta)
}

// GET /api/comp-analytics/insights?comp_id={id}
// Per-round engagement rates + drop-off detection.
// { rounds: [{round_code, round_name, total_members, tipped_count, rate, is_open, tipping_closed}],
//   drop_offs: [{user_id, display_name, tipped_rounds, last_round}] }
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const compId = new URL(request.url).searchParams.get('comp_id')
    if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

    const admin = createAdminClient()
    if (!(await verifyCompAdmin(admin, user.id, compId)))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // 1. Get comp's tournament_id
    const { data: compRow } = await (admin.from('comps') as any)
      .select('tournament_id').eq('id', compId).single()
    const tournId: string | null = (compRow as any)?.tournament_id ?? null
    if (!tournId) return NextResponse.json({ rounds: [], drop_offs: [] })

    // 2. Get all rounds ordered by round_order
    const [{ data: roundRows }, { data: lockRows }] = await Promise.all([
      (admin.from('tournament_rounds') as any)
        .select('round_code, round_name, round_order')
        .eq('tournament_id', tournId)
        .order('round_order', { ascending: true }),
      (admin.from('round_locks') as any)
        .select('round_code, is_open, tipping_closed')
        .eq('tournament_id', tournId),
    ])

    // 3. Get all comp member IDs
    const { data: memberRows } = await (admin.from('user_comps') as any)
      .select('user_id, users(id, display_name, first_name)')
      .eq('comp_id', compId)

    const members: { user_id: string; display_name: string }[] = ((memberRows ?? []) as any[]).map((m: any) => ({
      user_id:      m.users?.id ?? m.user_id,
      display_name: m.users?.display_name ?? m.users?.first_name ?? 'Unknown',
    }))
    const totalMembers = members.length
    const memberIds = members.map(m => m.user_id)

    if (!totalMembers) return NextResponse.json({ rounds: [], drop_offs: [] })

    // 4. Get fixtures for this tournament only, grouped by round
    const { data: fixRows } = await admin
      .from('fixtures').select('id, round')
      .eq('tournament_id', tournId)

    const fixturesByRound: Record<string, number[]> = {}
    ;((fixRows ?? []) as any[]).forEach((f: any) => {
      if (!fixturesByRound[f.round]) fixturesByRound[f.round] = []
      fixturesByRound[f.round].push(f.id)
    })

    // 5. Get predictions by comp members for this tournament's fixtures
    // Filter by tournament_id directly to avoid cross-tournament contamination
    // and large fixture-id URL params.
    let predByFixture: Record<number, Set<string>> = {}
    if (memberIds.length) {
      const CHUNK = 100
      for (let i = 0; i < memberIds.length; i += CHUNK) {
        const chunk = memberIds.slice(i, i + CHUNK)
        const { data: predRows } = await (admin.from('predictions') as any)
          .select('user_id, fixture_id')
          .eq('tournament_id', tournId)
          .in('user_id', chunk)
        ;((predRows ?? []) as any[]).forEach((p: any) => {
          if (!predByFixture[p.fixture_id]) predByFixture[p.fixture_id] = new Set()
          predByFixture[p.fixture_id].add(p.user_id)
        })
      }
    }

    const lockMap: Record<string, { is_open: boolean; tipping_closed: boolean }> = {}
    ;((lockRows ?? []) as any[]).forEach((r: any) => { lockMap[r.round_code] = { is_open: r.is_open, tipping_closed: r.tipping_closed ?? false } })

    // 6. Build per-round engagement stats
    const roundStats = ((roundRows ?? []) as any[])
      .filter((r: any) => fixturesByRound[r.round_code]?.length)
      .map((r: any) => {
        const fixIds = fixturesByRound[r.round_code] ?? []
        const fixCount = fixIds.length

        // Count predictions per user for this round
        const userFixCount: Record<string, number> = {}
        fixIds.forEach(fid => {
          predByFixture[fid]?.forEach(uid => { userFixCount[uid] = (userFixCount[uid] ?? 0) + 1 })
        })

        const fullSet    = new Set<string>()  // tipped all fixtures
        const partialSet = new Set<string>()  // tipped ≥1 but <all
        Object.entries(userFixCount).forEach(([uid, cnt]) => {
          if (cnt >= fixCount) fullSet.add(uid)
          else partialSet.add(uid)
        })

        const lock = lockMap[r.round_code] ?? { is_open: false, tipping_closed: false }
        return {
          round_code:     r.round_code,
          round_name:     r.round_name,
          total_members:  totalMembers,
          // legacy — kept for drop-off detection below
          tipped_count:   fullSet.size + partialSet.size,
          rate:           totalMembers > 0 ? Math.round(((fullSet.size + partialSet.size) / totalMembers) * 100) : 0,
          // split metrics
          full_count:     fullSet.size,
          full_rate:      totalMembers > 0 ? Math.round((fullSet.size    / totalMembers) * 100) : 0,
          partial_count:  partialSet.size,
          partial_rate:   totalMembers > 0 ? Math.round((partialSet.size / totalMembers) * 100) : 0,
          is_open:        lock.is_open,
          tipping_closed: lock.tipping_closed,
          tipped_user_ids: [...fullSet, ...partialSet],
        }
      })

    // 7. Drop-off detection: members who tipped in an earlier round but not in a later closed round
    // "Closed" = tipping_closed=true (round has happened). We compare first-closed round tippers vs last-closed round tippers.
    const closedRounds = roundStats.filter(r => r.tipping_closed)
    let dropOffs: { user_id: string; display_name: string; tipped_rounds: number; last_round: string }[] = []

    if (closedRounds.length >= 2) {
      const firstRound = closedRounds[0]
      const lastRound  = closedRounds[closedRounds.length - 1]

      const firstTippers = new Set(firstRound.tipped_user_ids)
      const lastTippers  = new Set(lastRound.tipped_user_ids)

      // Members who tipped in the first round but not the most recent closed round
      const droppedOff = members.filter(m => firstTippers.has(m.user_id) && !lastTippers.has(m.user_id))

      dropOffs = droppedOff.map(m => {
        // Find the last round they tipped in
        let lastActiveRound = firstRound.round_code
        for (const r of closedRounds) {
          if (r.tipped_user_ids.includes(m.user_id)) lastActiveRound = r.round_code
        }
        const tippedCount = closedRounds.filter(r => r.tipped_user_ids.includes(m.user_id)).length
        return {
          user_id:      m.user_id,
          display_name: m.display_name,
          tipped_rounds: tippedCount,
          last_round:   lastActiveRound,
        }
      })
    }

    // Strip tipped_user_ids from response
    const rounds = roundStats.map(({ tipped_user_ids: _, ...r }) => r)

    return NextResponse.json({ rounds, drop_offs: dropOffs })

  } catch (err: any) {
    console.error('[comp-analytics/insights]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
