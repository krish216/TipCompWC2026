import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// GET /api/comp-health?comp_id={id}&round={code}
// Returns { tipped: number, total: number }
// Counts members who have submitted any prediction for the given round's fixtures.
// Uses raw prediction rows — not scored — so it works for the current open round.
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const compId = searchParams.get('comp_id')
    const round  = searchParams.get('round')

    if (!compId) return NextResponse.json({ error: 'comp_id required' }, { status: 400 })

    const admin = createAdminClient()

    // Get comp member IDs
    const { data: memberRows } = await (admin.from('user_comps') as any)
      .select('user_id').eq('comp_id', compId)
    const memberIds: string[] = (memberRows ?? []).map((m: any) => m.user_id)

    if (!memberIds.length) return NextResponse.json({ tipped: 0, total: 0 })

    if (!round) {
      // No specific round: count anyone who has made any prediction
      const { data: predRows } = await (admin.from('predictions') as any)
        .select('user_id')
        .in('user_id', memberIds)
      const uniqueTipped = new Set((predRows ?? []).map((p: any) => p.user_id))
      return NextResponse.json({ tipped: uniqueTipped.size, total: memberIds.length })
    }

    // Get fixture IDs for the round
    const { data: fixRows } = await admin
      .from('fixtures').select('id').eq('round', round)
    const fixtureIds: number[] = (fixRows ?? []).map((f: any) => f.id)

    if (!fixtureIds.length) return NextResponse.json({ tipped: 0, total: memberIds.length })

    // Count distinct members who have a prediction for any fixture in this round
    const { data: predRows } = await (admin.from('predictions') as any)
      .select('user_id')
      .in('user_id', memberIds)
      .in('fixture_id', fixtureIds)

    const uniqueTipped = new Set((predRows ?? []).map((p: any) => p.user_id))
    return NextResponse.json({ tipped: uniqueTipped.size, total: memberIds.length })

  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 })
  }
}
