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

  const countBy = (col: string, val: string) =>
    (admin.from('report_link_clicks') as any).select('id', { count: 'exact', head: true }).eq(col, val)

  // Card→chat clicks by source surface, report opens, Round Debrief opens, auto-posts.
  const [home, homeLegacy, predict, scoreboard, reportOpens, debriefLb, debriefPr, debriefLegacy, { count: posts }] = await Promise.all([
    countBy('source', 'home'),
    countBy('source', 'home_card'),     // legacy rows before per-surface tagging
    countBy('source', 'predict'),
    countBy('source', 'scoreboard'),
    countBy('source', 'chat_report'),
    countBy('source', 'debrief_leaderboard'),
    countBy('source', 'debrief_predict'),
    countBy('source', 'debrief'),        // legacy/untagged debrief opens
    (admin.from('weekly_report_posts') as any).select('tribe_id', { count: 'exact', head: true }),
  ])

  const by_source = {
    home:       (home.count ?? 0) + (homeLegacy.count ?? 0),
    predict:    predict.count ?? 0,
    scoreboard: scoreboard.count ?? 0,
  }
  const chat_clicks = by_source.home + by_source.predict + by_source.scoreboard

  const debrief = {
    leaderboard: debriefLb.count ?? 0,
    predict:     debriefPr.count ?? 0,
    total:       (debriefLb.count ?? 0) + (debriefPr.count ?? 0) + (debriefLegacy.count ?? 0),
  }

  return NextResponse.json({
    clicks:       chat_clicks,                 // card → chat (all surfaces)
    report_opens: reportOpens.count ?? 0,      // report link opened from chat
    posts:        posts ?? 0,
    by_source,
    debrief,                                   // Round Debrief opens (by surface)
  })
}
