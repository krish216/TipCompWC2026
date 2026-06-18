import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getSessionUser } from '@/lib/supabase-server'
import { untippedForOpenRound } from '@/lib/untipped'

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

    const r = await untippedForOpenRound(admin, compId)
    return NextResponse.json({
      round_code:     r.round_code,
      round_name:     r.round_name,
      deadline:       r.deadline,
      total_tipsters: r.total_tipsters,
      tipped_count:   r.tipped_count,
      untipped_count: r.untipped.length,
      untipped:       r.untipped,
    })

  } catch (err: any) {
    console.error('[comp-analytics/engagement]', err)
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 })
  }
}
