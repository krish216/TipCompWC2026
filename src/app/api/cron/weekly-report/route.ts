import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { MIN_TRIBE_MEMBERS, REPORT_SITE_URL, mondayOf, postReportToTribe } from '@/lib/weekly-report'

export const dynamic = 'force-dynamic'

// Posts the members-only Weekly Intelligence Report link into each eligible
// tribe's chat (as a system message) and notifies members via the bell, once per
// week. Gated by the `weekly_report_card` flag (same toggle as the homepage card)
// and to tribes with >= MIN_TRIBE_MEMBERS. Authed with CRON_SECRET (Bearer),
// scheduled via Supabase pg_cron — see supabase/saved-migrations/weekly-report-pg_cron.sql.

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Feature gate — the admin toggle controls auto-post too.
  const { data: flag } = await (admin.from('app_settings') as any)
    .select('value').eq('key', 'weekly_report_card').maybeSingle()
  if ((flag as any)?.value !== 'on') return NextResponse.json({ skipped: 'feature off' })

  // Live tournament(s) — keyed off tournaments.is_active, NOT the
  // app_settings.active_tournament_id flag (which can point at a future/inactive
  // season, e.g. a pre-staged Champions League).
  const { data: activeTourns } = await (admin.from('tournaments') as any)
    .select('id').eq('is_active', true)
  const tournIds: string[] = ((activeTourns ?? []) as any[]).map(t => t.id)
  if (!tournIds.length) return NextResponse.json({ skipped: 'no active tournament' })

  // Tribes in the active tournament(s) + their member counts.
  const { data: tribes } = await (admin.from('tribes') as any)
    .select('id').in('tournament_id', tournIds)
  const tribeIds: string[] = (tribes ?? []).map((t: any) => t.id)
  if (!tribeIds.length) return NextResponse.json({ posted: 0, reason: 'no tribes' })

  const { data: memberRows } = await (admin.from('tribe_members') as any)
    .select('tribe_id').in('tribe_id', tribeIds)
  const counts: Record<string, number> = {}
  for (const r of (memberRows ?? [])) counts[(r as any).tribe_id] = (counts[(r as any).tribe_id] ?? 0) + 1
  const eligible = tribeIds.filter(id => (counts[id] ?? 0) >= MIN_TRIBE_MEMBERS)
  if (!eligible.length) return NextResponse.json({ posted: 0, reason: `no tribe >= ${MIN_TRIBE_MEMBERS} members` })

  const week = mondayOf(new Date())

  // Skip tribes already posted this week.
  const { data: already } = await (admin.from('weekly_report_posts') as any)
    .select('tribe_id').eq('week_start', week).in('tribe_id', eligible)
  const done = new Set((already ?? []).map((r: any) => r.tribe_id))
  const todo = eligible.filter(id => !done.has(id))

  let posted = 0, notified = 0
  for (const tribeId of todo) {
    try {
      const r = await postReportToTribe(admin, tribeId, REPORT_SITE_URL)
      posted++; notified += r.notified
    } catch { /* skip this tribe, continue */ }
  }

  return NextResponse.json({ posted, notified, eligible: eligible.length, week })
}
