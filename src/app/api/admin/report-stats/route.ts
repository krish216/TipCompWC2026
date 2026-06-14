import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/admin/report-stats — funnel counters for the tournament-admin panel.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: isAdmin } = await admin.from('admin_users').select('user_id').eq('user_id', user.id).single()
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ count: clicks }, { count: posts }] = await Promise.all([
    (admin.from('report_link_clicks') as any).select('id', { count: 'exact', head: true }),
    (admin.from('weekly_report_posts') as any).select('tribe_id', { count: 'exact', head: true }),
  ])

  return NextResponse.json({ clicks: clicks ?? 0, posts: posts ?? 0 })
}
