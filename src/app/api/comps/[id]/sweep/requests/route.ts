import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { signReceiptUrls } from '@/lib/sweep/receipts'

export const dynamic = 'force-dynamic'

// GET /api/comps/:id/sweep/requests?status=&owing=true — comp-admin/platform-admin only.
// Joins across every pool under the comp in one query — the organiser's "Requests"/"Who
// owes what" tab doesn't need N per-pool fetches. owing = pending, or approved-but-unpaid
// (an outstanding IOU).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const [{ data: compAdminRow }, { data: platformAdmin }] = await Promise.all([
    (admin.from('comp_admins') as any).select('user_id').eq('comp_id', params.id).eq('user_id', user.id).maybeSingle(),
    (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle(),
  ])
  if (!compAdminRow && !platformAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const owing = url.searchParams.get('owing') === 'true'

  let query = (admin.from('sweep_payment_requests') as any).select('*').eq('comp_id', params.id).order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let rows = (data ?? []) as any[]
  if (owing) rows = rows.filter(r => r.status === 'pending' || (r.status === 'approved' && !r.paid_at))

  const userIds = [...new Set(rows.map(r => r.user_id))]
  const { data: users } = userIds.length
    ? await (admin.from('users') as any).select('id, display_name, avatar_url').in('id', userIds)
    : { data: [] }
  const userById = Object.fromEntries(((users ?? []) as any[]).map(u => [u.id, u]))

  const withUsers = rows.map(r => ({ ...r, buyer: userById[r.user_id] ?? null }))

  return NextResponse.json({ data: await signReceiptUrls(admin, withUsers) })
}
