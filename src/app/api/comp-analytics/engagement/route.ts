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

// GET /api/comp-analytics/engagement?comp_id={id}
// Returns untipped tipsters for the currently open tipping round.
// { round_code, round_name, deadline, total_tipsters, tipped_count, untipped_count, untipped[] }
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
    if (!tournId) return NextResponse.json({ round_code: null, total_tipsters: 0, tipped_count: 0, untipped_count: 0, untipped: [] })

    // 2. Find the open tipping round (is_open=true, tipping_closed IS NOT TRUE)
    // Must use .not('tipping_closed','is',true) — .eq('tipping_closed',false) silently
    // drops rows where tipping_closed is NULL (PostgreSQL NULL=false evaluates to NULL).
    const { data: lockRows } = await (admin.from('round_locks') as any)
      .select('round_code, is_open, tipping_closed')
      .eq('tournament_id', tournId)
      .eq('is_open', true)
      .not('tipping_closed', 'is', true)

    if (!lockRows?.length) {
      return NextResponse.json({ round_code: null, total_tipsters: 0, tipped_count: 0, untipped_count: 0, untipped: [] })
    }

    // Use first open round; prefer 'gs' over knockout if multiple open simultaneously
    const openRound = (lockRows as any[]).find((r: any) => r.round_code === 'gs') ?? (lockRows as any[])[0]
    const roundCode: string = openRound.round_code

    // 3. Get round name and fixtures
    const [{ data: roundRow }, { data: fixRows }] = await Promise.all([
      (admin.from('tournament_rounds') as any)
        .select('round_name').eq('tournament_id', tournId).eq('round_code', roundCode).single(),
      admin.from('fixtures').select('id, kickoff_utc').eq('round', roundCode).order('kickoff_utc', { ascending: true }),
    ])

    const fixtureIds: number[] = ((fixRows ?? []) as any[]).map((f: any) => f.id)
    // Deadline = earliest upcoming kickoff; fallback to first fixture
    const now = new Date()
    const upcoming = ((fixRows ?? []) as any[]).filter((f: any) => new Date(f.kickoff_utc) > now)
    const deadline: string | null = upcoming[0]?.kickoff_utc ?? (fixRows as any[])?.[0]?.kickoff_utc ?? null

    if (!fixtureIds.length) {
      return NextResponse.json({ round_code: roundCode, round_name: (roundRow as any)?.round_name ?? roundCode, deadline, total_tipsters: 0, tipped_count: 0, untipped_count: 0, untipped: [] })
    }

    // 4. Get all comp members with user info
    const { data: memberRows } = await (admin.from('user_comps') as any)
      .select('user_id, users(id, display_name, first_name, email)')
      .eq('comp_id', compId)

    const members: { user_id: string; display_name: string; email: string }[] = ((memberRows ?? []) as any[]).map((m: any) => ({
      user_id:      m.users?.id ?? m.user_id,
      display_name: m.users?.display_name ?? m.users?.first_name ?? 'Unknown',
      email:        m.users?.email ?? '',
    }))

    if (!members.length) {
      return NextResponse.json({ round_code: roundCode, round_name: (roundRow as any)?.round_name ?? roundCode, deadline, total_tipsters: 0, tipped_count: 0, untipped_count: 0, untipped: [] })
    }

    const memberIds = members.map(m => m.user_id)

    // 5. Get members who have tipped any fixture in this round
    const { data: predRows } = await (admin.from('predictions') as any)
      .select('user_id')
      .in('user_id', memberIds)
      .in('fixture_id', fixtureIds)

    const tippedSet = new Set(((predRows ?? []) as any[]).map((p: any) => p.user_id))

    const untipped = members.filter(m => !tippedSet.has(m.user_id))

    return NextResponse.json({
      round_code:     roundCode,
      round_name:     (roundRow as any)?.round_name ?? roundCode,
      deadline,
      total_tipsters: members.length,
      tipped_count:   tippedSet.size,
      untipped_count: untipped.length,
      untipped,
    })

  } catch (err: any) {
    console.error('[comp-analytics/engagement]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
