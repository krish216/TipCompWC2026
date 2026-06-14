import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'
import { postReportToTribe } from '@/lib/weekly-report'

export const dynamic = 'force-dynamic'

// POST /api/tribes/post-report { tribe_id }
// Comp-admin action: post the Weekly Intelligence Report into a tribe's chat (as
// a TribePicks system message) and notify members. Mirrors the weekly cron via
// the shared postReportToTribe helper.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tribe_id } = await request.json().catch(() => ({}))
  if (!tribe_id) return NextResponse.json({ error: 'tribe_id required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: tribe } = await (admin.from('tribes') as any).select('comp_id').eq('id', tribe_id).single()
  const compId = (tribe as any)?.comp_id

  // Authorise: global admin OR comp admin of this tribe's comp.
  const [{ data: ga }, { data: ca }] = await Promise.all([
    (admin.from('admin_users') as any).select('user_id').eq('user_id', user.id).maybeSingle(),
    compId
      ? (admin.from('comp_admins') as any).select('user_id').eq('user_id', user.id).eq('comp_id', compId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!ga && !ca) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const r = await postReportToTribe(admin, tribe_id, new URL(request.url).origin)
    return NextResponse.json({ ok: true, notified: r.notified })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to post report' }, { status: 500 })
  }
}
