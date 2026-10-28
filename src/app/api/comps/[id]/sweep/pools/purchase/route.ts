import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { buyPools } from '@/lib/sweep/billing'

export const dynamic = 'force-dynamic'

// POST /api/comps/:id/sweep/pools/purchase — organiser adds pools to their sweep.
// Body: { pools: number } (how many to ADD). Returns { completed: true } when the pools exist
// already (billing off, or a platform admin), else { checkout_url } to send the browser to.
// The webhook fulfils Stripe purchases — the redirect back proves nothing.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const [{ data: comp }, { data: compAdminRow }, { data: platformAdmin }] = await Promise.all([
    (admin.from('comps') as any).select('created_by, tournament_id').eq('id', params.id).maybeSingle(),
    (admin.from('comp_admins') as any).select('user_id').eq('comp_id', params.id).eq('user_id', user.id).maybeSingle(),
    (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  if (!comp) return NextResponse.json({ error: 'Sweep not found' }, { status: 404 })
  if ((comp as any).created_by !== user.id && !compAdminRow && !platformAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { data: tourn } = await (admin.from('tournaments') as any)
    .select('format').eq('id', (comp as any).tournament_id).maybeSingle()
  if ((tourn as any)?.format !== 'sweep') return NextResponse.json({ error: 'This comp is not a sweep' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const result = await buyPools(admin, { compId: params.id, userId: user.id, pools: Number(body?.pools) })
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.kind === 'redirect' ? { checkout_url: result.url } : { completed: true })
}
